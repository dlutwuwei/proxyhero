use proxy_core::{
    builtin_presets, AppRules, CA_CERT_FILE, Preset, Session, SessionEvent, SharedState,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::cert::{self, CertDiagnostic, CertInfo};
use crate::config::{
    cert_dir, config_path, rules_path, save_config,
    save_rules, AppConfig,
};
use crate::state::AppState;
use crate::system_proxy::{self, get_lan_ip, manual_proxy_hint};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    pub running: bool,
    pub port: u16,
    pub session_count: usize,
    pub lan_ip: Option<String>,
}

fn proxy_status(running: bool, port: u16, session_count: usize) -> ProxyStatus {
    ProxyStatus {
        running,
        port,
        session_count,
        lan_ip: get_lan_ip(),
    }
}

#[tauri::command]
pub async fn get_proxy_status(state: State<'_, AppState>) -> Result<ProxyStatus, String> {
    let config = state.config.lock().await;
    let server = state.proxy_server.lock().await;
    let count = state.shared.sessions.read().await.len();
    Ok(proxy_status(
        server.is_running(),
        config.proxy_port,
        count,
    ))
}

#[tauri::command]
pub async fn start_proxy(app: AppHandle, state: State<'_, AppState>) -> Result<ProxyStatus, String> {
    state.sync_rules_to_proxy().await;
    let port = state.config.lock().await.proxy_port;
    let cdir = cert_dir(&state.data_dir);
    let mut server = state.proxy_server.lock().await;
    if !server.is_running() {
        server
            .start(port, &cdir, state.shared.clone())
            .await?;
        let _ = app.emit("proxy:status", serde_json::json!({ "running": true, "port": port }));
    }
    drop(server);
    get_proxy_status(state).await
}

#[tauri::command]
pub async fn stop_proxy(app: AppHandle, state: State<'_, AppState>) -> Result<ProxyStatus, String> {
    let mut server = state.proxy_server.lock().await;
    server.stop().await;
    drop(server);
    let _ = app.emit("proxy:status", serde_json::json!({ "running": false }));
    get_proxy_status(state).await
}

#[tauri::command]
pub async fn clear_sessions(state: State<'_, AppState>) -> Result<(), String> {
    state.shared.clear_sessions().await;
    Ok(())
}

#[tauri::command]
pub async fn clear_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state.shared.clear_session(&session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    let order = state.shared.session_order.read().await;
    let map = state.shared.sessions.read().await;
    Ok(order
        .iter()
        .filter_map(|id| map.get(id).cloned())
        .collect())
}

#[tauri::command]
pub async fn get_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<Session>, String> {
    Ok(state
        .shared
        .sessions
        .read()
        .await
        .get(&session_id)
        .cloned())
}

#[tauri::command]
pub async fn set_capture_paused(
    state: State<'_, AppState>,
    paused: bool,
) -> Result<(), String> {
    state
        .shared
        .capture_paused
        .store(paused, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn get_rules(state: State<'_, AppState>) -> Result<AppRules, String> {
    Ok(state.rules.lock().await.clone())
}

#[tauri::command]
pub async fn save_rules_cmd(
    state: State<'_, AppState>,
    rules: AppRules,
) -> Result<(), String> {
    save_rules(&rules_path(&state.data_dir), &rules).await?;
    *state.rules.lock().await = rules.clone();
    state.sync_rules_to_proxy().await;
    Ok(())
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.config.lock().await.clone())
}

#[tauri::command]
pub async fn save_config_cmd(
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    save_config(&config_path(&state.data_dir), &config).await?;
    *state.config.lock().await = config;
    Ok(())
}

#[tauri::command]
pub fn get_presets() -> Vec<Preset> {
    builtin_presets()
}

#[tauri::command]
pub async fn apply_preset(
    state: State<'_, AppState>,
    preset_id: String,
) -> Result<AppRules, String> {
    let preset = builtin_presets()
        .into_iter()
        .find(|p| p.id == preset_id)
        .ok_or_else(|| "preset not found".to_string())?;
    let mut rules = state.rules.lock().await.clone();
    for r in preset.map_remote {
        let dup = rules.map_remote.iter().any(|x| {
            x.match_rule.host == r.match_rule.host && x.map_to.port == r.map_to.port
        });
        if !dup {
            rules.map_remote.push(r);
        }
    }
    for host in preset.ssl_exclude {
        if !rules.ssl.exclude_hosts.contains(&host) {
            rules.ssl.exclude_hosts.push(host);
        }
    }
    save_rules(&rules_path(&state.data_dir), &rules).await?;
    *state.rules.lock().await = rules.clone();
    state.sync_rules_to_proxy().await;
    Ok(rules)
}

#[tauri::command]
pub fn get_cert_info(state: State<'_, AppState>) -> CertInfo {
    cert::cert_info(&cert_dir(&state.data_dir))
}

#[tauri::command]
pub async fn get_cert_diagnostic(state: State<'_, AppState>) -> Result<CertDiagnostic, String> {
    let running = state.proxy_server.lock().await.is_running();
    Ok(cert::cert_diagnostic(&cert_dir(&state.data_dir), running))
}

#[tauri::command]
pub async fn ensure_ca(state: State<'_, AppState>) -> Result<CertInfo, String> {
    let cdir = cert_dir(&state.data_dir);
    proxy_core::ensure_ca_files(&cdir)?;
    Ok(cert::cert_info(&cdir))
}

#[tauri::command]
pub async fn install_ca(state: State<'_, AppState>) -> Result<String, String> {
    let cert_path = cert_dir(&state.data_dir).join(CA_CERT_FILE);
    if !cert_path.exists() {
        return Err("请先生成证书（启动一次代理）".into());
    }
    let mut msg = cert::install_ca(&cert_path)?;
    let was_running = state.proxy_server.lock().await.is_running();
    if was_running {
        let port = state.config.lock().await.proxy_port;
        let cdir = cert_dir(&state.data_dir);
        let mut server = state.proxy_server.lock().await;
        server.stop().await;
        server
            .start(port, &cdir, state.shared.clone())
            .await?;
        msg.push_str(" 已自动重启代理以加载当前 CA。");
    }
    Ok(msg)
}

#[tauri::command]
pub async fn regenerate_ca(state: State<'_, AppState>) -> Result<CertInfo, String> {
    let cdir = cert_dir(&state.data_dir);
    cert::regenerate_ca(&cdir)?;
    Ok(cert::cert_info(&cdir))
}

#[tauri::command]
pub fn open_cert_dir(state: State<'_, AppState>) -> Result<String, String> {
    let cdir = cert_dir(&state.data_dir);
    std::fs::create_dir_all(&cdir).map_err(|e| e.to_string())?;
    Ok(cdir.display().to_string())
}

#[tauri::command]
pub async fn set_system_proxy(
    state: State<'_, AppState>,
    enable: bool,
) -> Result<String, String> {
    let mut config = state.config.lock().await.clone();
    let port = config.proxy_port;
    let host = "127.0.0.1";
    let msg = system_proxy::set_system_proxy(&state.data_dir, host, port, enable)?;
    config.system_proxy_enabled = enable;
    save_config(&config_path(&state.data_dir), &config).await?;
    *state.config.lock().await = config;
    Ok(msg)
}

#[tauri::command]
pub fn get_device_proxy_hint(state: State<'_, AppState>) -> String {
    let port = state.config.blocking_lock().proxy_port;
    let lan = get_lan_ip().unwrap_or_else(|| "本机局域网IP".into());
    format!(
        "{}\n局域网 IP：{lan}",
        manual_proxy_hint("127.0.0.1", port),
        lan = lan
    )
}

#[tauri::command]
pub async fn session_to_curl(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<String, String> {
    let sessions = state.shared.sessions.read().await;
    let session = sessions
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    Ok(proxy_core::format_session_curl(&session))
}

pub fn spawn_session_listener(app: AppHandle, state: Arc<SharedState>) {
    let mut rx = state.subscribe();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let payload = match &event {
                        SessionEvent::Created { session } => {
                            serde_json::json!({ "type": "created", "session": session })
                        }
                        SessionEvent::Updated { session } => {
                            serde_json::json!({ "type": "updated", "session": session })
                        }
                        SessionEvent::Completed { session } => {
                            serde_json::json!({ "type": "completed", "session": session })
                        }
                    };
                    let _ = app.emit("session:event", payload);
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    });
}

use std::sync::Arc;
