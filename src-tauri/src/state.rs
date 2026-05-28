use std::sync::Arc;

use proxy_core::{AppRules, ProxyServer, SharedState};
use tokio::sync::Mutex;

use crate::config::{AppConfig, cert_dir};

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
}
