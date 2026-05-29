use std::path::{Path, PathBuf};

use proxy_core::AppRules;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub proxy_port: u16,
    pub max_sessions: usize,
    pub capture_enabled: bool,
    pub system_proxy_enabled: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            proxy_port: 8888,
            max_sessions: 10_000,
            capture_enabled: true,
            system_proxy_enabled: false,
        }
    }
}

pub fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

pub fn rules_path(data_dir: &Path) -> PathBuf {
    data_dir.join("rules.json")
}

pub fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("config.json")
}

pub fn cert_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("certs")
}

pub async fn load_rules(path: impl AsRef<Path>) -> AppRules {
    if let Ok(content) = tokio::fs::read_to_string(path.as_ref()).await {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AppRules::default()
    }
}

pub async fn save_rules(path: impl AsRef<Path>, rules: &AppRules) -> Result<(), String> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(rules).map_err(|e| e.to_string())?;
    tokio::fs::write(path, json)
        .await
        .map_err(|e| e.to_string())
}

pub async fn load_config(path: impl AsRef<Path>) -> AppConfig {
    if let Ok(content) = tokio::fs::read_to_string(path.as_ref()).await {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

pub async fn save_config(path: impl AsRef<Path>, config: &AppConfig) -> Result<(), String> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    tokio::fs::write(path, json)
        .await
        .map_err(|e| e.to_string())
}
