use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

use crate::config::{config_path, save_config, AppConfig};
use crate::state::AppState;
use crate::system_proxy;

static CLEANUP_DONE: AtomicBool = AtomicBool::new(false);
static EMERGENCY_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn register_emergency_data_dir(data_dir: PathBuf) {
    let _ = EMERGENCY_DATA_DIR.set(data_dir);
}

pub fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(dir) = EMERGENCY_DATA_DIR.get() {
            emergency_cleanup(dir);
        }
        prev(info);
    }));
}

fn load_config_sync(path: &Path) -> AppConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config_sync(path: &Path, config: &AppConfig) {
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = std::fs::write(path, json);
    }
}

fn should_clear_system_proxy(data_dir: &Path, config: &AppConfig) -> bool {
    config.system_proxy_enabled || system_proxy::has_proxy_backup(data_dir)
}

fn clear_system_proxy_sync(data_dir: &Path, port: u16) {
    let _ = system_proxy::set_system_proxy(data_dir, "127.0.0.1", port, false);
}

fn persist_system_proxy_disabled(data_dir: &Path) {
    let path = config_path(data_dir);
    let mut config = load_config_sync(&path);
    if config.system_proxy_enabled {
        config.system_proxy_enabled = false;
        save_config_sync(&path, &config);
    }
}

pub fn recover_stale_system_proxy(data_dir: &Path) {
    let cfg_path = config_path(data_dir);
    let config = load_config_sync(&cfg_path);
    if !should_clear_system_proxy(data_dir, &config) {
        return;
    }
    clear_system_proxy_sync(data_dir, config.proxy_port);
    persist_system_proxy_disabled(data_dir);
}

pub fn emergency_cleanup(data_dir: &Path) {
    if CLEANUP_DONE.swap(true, Ordering::SeqCst) {
        return;
    }
    let cfg_path = config_path(data_dir);
    let config = load_config_sync(&cfg_path);
    if should_clear_system_proxy(data_dir, &config) {
        clear_system_proxy_sync(data_dir, config.proxy_port);
        persist_system_proxy_disabled(data_dir);
    }
}

pub fn cleanup_on_exit(app: &AppHandle) {
    if CLEANUP_DONE.swap(true, Ordering::SeqCst) {
        return;
    }

    let Some(state) = app.try_state::<AppState>() else {
        if let Some(dir) = EMERGENCY_DATA_DIR.get() {
            emergency_cleanup(dir);
        }
        return;
    };

    tauri::async_runtime::block_on(async {
        state.proxy_server.lock().await.stop().await;
    });

    let (port, clear_sys) = {
        let cfg = state.config.blocking_lock();
        (
            cfg.proxy_port,
            should_clear_system_proxy(&state.data_dir, &cfg),
        )
    };

    if clear_sys {
        clear_system_proxy_sync(&state.data_dir, port);
        tauri::async_runtime::block_on(async {
            let mut cfg = state.config.lock().await;
            if cfg.system_proxy_enabled {
                cfg.system_proxy_enabled = false;
                let _ = save_config(&config_path(&state.data_dir), &cfg).await;
            }
        });
    }
}
