mod cert;
mod commands;
mod config;
mod shutdown;
mod state;
mod system_proxy;

use std::path::PathBuf;

use state::AppState;
use tauri::{Manager, RunEvent};

#[cfg(target_os = "macos")]
fn apply_macos_window_theme(window: &tauri::WebviewWindow) {
    use objc2_app_kit::{
        NSAppearance, NSAppearanceCustomization, NSAppearanceNameDarkAqua, NSColor, NSWindow,
    };

    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };
    let ns_window = unsafe { &*(ns_window_ptr as *mut NSWindow) };
    let bg = NSColor::colorWithRed_green_blue_alpha(30.0 / 255.0, 30.0 / 255.0, 30.0 / 255.0, 1.0);
    ns_window.setBackgroundColor(Some(&bg));
    if let Some(appearance) = unsafe { NSAppearance::appearanceNamed(NSAppearanceNameDarkAqua) } {
        ns_window.setAppearance(Some(&appearance));
    }
}

#[cfg(mobile)]
#[tauri::mobile_entry_point]
pub fn run() {
    run_app(tauri::generate_context!());
}

pub fn run_app(context: tauri::Context<tauri::Wry>) {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                apply_macos_window_theme(&window);
            }

            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let data_dir: PathBuf = config::app_data_dir(&handle).expect("app data dir");
                std::fs::create_dir_all(&data_dir).ok();
                shutdown::register_emergency_data_dir(data_dir.clone());
                shutdown::install_panic_hook();
                shutdown::recover_stale_system_proxy(&data_dir);
                let cfg_path = config::config_path(&data_dir.as_path());
                let rules_path = config::rules_path(&data_dir.as_path());
                let cfg = config::load_config(cfg_path.as_path()).await;
                let rules = config::load_rules(rules_path.as_path()).await;
                let app_state = AppState::new(data_dir.to_path_buf(), cfg, rules);
                app_state.sync_rules_to_proxy().await;
                let shared = app_state.shared.clone();
                commands::spawn_session_listener(handle.clone(), shared);
                handle.manage(app_state);
            });

            let signal_handle = app.handle().clone();
            ctrlc::set_handler(move || {
                shutdown::cleanup_on_exit(&signal_handle);
                std::process::exit(0);
            })
            .ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_proxy_status,
            commands::start_proxy,
            commands::stop_proxy,
            commands::clear_sessions,
            commands::clear_session,
            commands::list_sessions,
            commands::get_session,
            commands::set_capture_paused,
            commands::get_rules,
            commands::save_rules_cmd,
            commands::get_config,
            commands::save_config_cmd,
            commands::get_presets,
            commands::apply_preset,
            commands::get_cert_info,
            commands::get_cert_diagnostic,
            commands::ensure_ca,
            commands::install_ca,
            commands::regenerate_ca,
            commands::open_cert_dir,
            commands::set_system_proxy,
            commands::get_device_proxy_hint,
            commands::session_to_curl,
        ])
        .build(context)
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                shutdown::cleanup_on_exit(app_handle);
            }
        });
}
