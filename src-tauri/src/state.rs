use std::sync::Arc;

use proxy_core::{AppRules, ProxyServer, SharedState};
use tokio::sync::Mutex;

use crate::config::{cert_dir, AppConfig};

pub struct AppState {
    pub proxy_server: Mutex<ProxyServer>,
    pub shared: Arc<SharedState>,
    pub config: Mutex<AppConfig>,
    pub rules: Mutex<AppRules>,
    pub data_dir: std::path::PathBuf,
}

impl AppState {
    pub fn new(data_dir: std::path::PathBuf, config: AppConfig, rules: AppRules) -> Self {
        let cdir = cert_dir(&data_dir);
        let shared = Arc::new(SharedState::new(config.max_sessions, cdir));
        Self {
            proxy_server: Mutex::new(ProxyServer::new()),
            shared,
            config: Mutex::new(config),
            rules: Mutex::new(rules),
            data_dir,
        }
    }

    pub async fn sync_rules_to_proxy(&self) {
        let rules = self.rules.lock().await.clone();
        *self.shared.rules.write().await = rules;
    }

    pub async fn restart_proxy_if_running(&self) -> Result<bool, String> {
        let port = self.config.lock().await.proxy_port;
        let cdir = cert_dir(&self.data_dir);
        let mut server = self.proxy_server.lock().await;
        if !server.is_running() {
            return Ok(false);
        }
        tracing::info!("restarting proxy to apply SSL rule changes");
        server.stop_forced().await;
        let mut last_err = None;
        for attempt in 0..5 {
            match server.start(port, &cdir, self.shared.clone()).await {
                Ok(()) => return Ok(true),
                Err(e) => {
                    tracing::warn!(attempt, error = %e, "proxy restart bind failed, retrying");
                    last_err = Some(e);
                    tokio::time::sleep(std::time::Duration::from_millis(50 * (attempt + 1) as u64))
                        .await;
                }
            }
        }
        Err(last_err.unwrap_or_else(|| "proxy restart failed".into()))
    }
}
