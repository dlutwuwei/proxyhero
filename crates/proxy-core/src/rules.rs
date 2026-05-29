use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRules {
    pub map_remote: Vec<MapRemoteRule>,
    pub map_local: Vec<MapLocalRule>,
    pub ssl: SslConfig,
    #[serde(default)]
    pub allowed_map_hosts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRemoteRule {
    pub id: String,
    pub enabled: bool,
    pub name: String,
    pub order: i32,
    pub match_rule: MatchRule,
    pub map_to: MapToTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapLocalRule {
    pub id: String,
    pub enabled: bool,
    pub name: String,
    pub order: i32,
    pub match_rule: MatchRule,
    pub local_file: String,
    pub status: u16,
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchRule {
    #[serde(default)]
    pub protocol: Option<String>,
    pub host: String,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapToTarget {
    pub protocol: String,
    pub host: String,
    pub port: u16,
    #[serde(default = "default_true")]
    pub preserve_path: bool,
    #[serde(default)]
    pub preserve_query: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SslConfig {
    pub mode: SslMode,
    pub include_hosts: Vec<String>,
    pub exclude_hosts: Vec<String>,
}

impl Default for SslConfig {
    fn default() -> Self {
        Self {
            mode: SslMode::Default,
            include_hosts: vec![],
            exclude_hosts: vec!["*.apple.com".to_string(), "*.mzstatic.com".to_string()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SslMode {
    Default,
    Include,
    Exclude,
}

impl Default for AppRules {
    fn default() -> Self {
        Self {
            map_remote: vec![],
            map_local: vec![],
            ssl: SslConfig::default(),
            allowed_map_hosts: vec!["localhost".to_string(), "127.0.0.1".to_string()],
        }
    }
}

fn map_remote_preset(name: &str, host: &str, port: u16, order: i32) -> MapRemoteRule {
    MapRemoteRule {
        id: uuid::Uuid::new_v4().to_string(),
        enabled: true,
        name: name.into(),
        order,
        match_rule: MatchRule {
            protocol: Some("https".into()),
            host: host.into(),
            path: None,
        },
        map_to: MapToTarget {
            protocol: "http".into(),
            host: "127.0.0.1".into(),
            port,
            preserve_path: true,
            preserve_query: true,
        },
    }
}

pub fn builtin_presets() -> Vec<Preset> {
    vec![
        Preset {
            id: "local-api-8080".into(),
            name: "本地 API (8080)".into(),
            description: "https://api.example.com → 127.0.0.1:8080".into(),
            map_remote: vec![map_remote_preset(
                "api.example.com → 8080",
                "api.example.com",
                8080,
                0,
            )],
            ssl_exclude: vec![],
        },
        Preset {
            id: "local-dev-3000".into(),
            name: "本地开发服务 (3000)".into(),
            description: "https://localhost → 127.0.0.1:3000".into(),
            map_remote: vec![map_remote_preset("localhost → 3000", "localhost", 3000, 0)],
            ssl_exclude: vec![],
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub map_remote: Vec<MapRemoteRule>,
    pub ssl_exclude: Vec<String>,
}

pub fn is_map_target_allowed(host: &str, allowed: &[String]) -> bool {
    let host_lower = host.to_lowercase();
    if host_lower.parse::<std::net::IpAddr>().is_ok() {
        return true;
    }
    if host_lower == "localhost" || host_lower == "127.0.0.1" {
        return true;
    }
    for pattern in allowed {
        let p = pattern.trim().to_lowercase();
        if p == host_lower {
            return true;
        }
        if let Some(suffix) = p.strip_prefix("*.") {
            if host_lower == suffix || host_lower.ends_with(&format!(".{suffix}")) {
                return true;
            }
        }
    }
    false
}
