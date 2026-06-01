use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const MAX_BODY_BYTES: usize = 1024 * 1024;
pub const MAX_WS_MESSAGES: usize = 500;
pub const MAX_WS_PAYLOAD_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpMessage {
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub body_base64: Option<String>,
    pub is_binary: bool,
    pub size: usize,
    #[serde(default)]
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSocketMessage {
    pub direction: String,
    pub timestamp: DateTime<Utc>,
    pub opcode: String,
    pub payload: String,
    pub payload_base64: Option<String>,
    pub is_binary: bool,
    pub size: usize,
    #[serde(default)]
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub started_at: DateTime<Utc>,
    pub method: String,
    pub url: String,
    pub host: String,
    pub path: String,
    pub scheme: String,
    pub is_https: bool,
    pub status: Option<u16>,
    pub duration_ms: Option<u64>,
    pub request_size: usize,
    pub response_size: Option<usize>,
    pub request: Option<HttpMessage>,
    pub response: Option<HttpMessage>,
    pub mapped_rule_id: Option<String>,
    pub mapped_rule_name: Option<String>,
    pub map_type: Option<String>,
    pub ssl_tunnel: bool,
    pub completed: bool,
    pub client_addr: Option<String>,
    pub user_agent: Option<String>,
    pub client_name: String,
    #[serde(default)]
    pub tls_preset: Option<String>,
    #[serde(default, rename = "isWebSocket")]
    pub is_websocket: bool,
    #[serde(default)]
    pub websocket_messages: Vec<WebSocketMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionEvent {
    Created { session: Session },
    Updated { session: Session },
    Completed { session: Session },
}

impl Session {
    pub fn new(
        id: String,
        method: String,
        url: String,
        host: String,
        path: String,
        scheme: String,
    ) -> Self {
        let is_https = scheme == "https";
        Self {
            id,
            started_at: Utc::now(),
            method,
            url,
            host,
            path,
            scheme,
            is_https,
            status: None,
            duration_ms: None,
            request_size: 0,
            response_size: None,
            request: None,
            response: None,
            mapped_rule_id: None,
            mapped_rule_name: None,
            map_type: None,
            ssl_tunnel: false,
            completed: false,
            client_addr: None,
            user_agent: None,
            client_name: "无标识".into(),
            tls_preset: None,
            is_websocket: false,
            websocket_messages: vec![],
        }
    }
}

pub fn is_websocket_handshake(headers: &[(String, String)]) -> bool {
    let mut has_key = false;
    let mut has_version = false;
    let mut has_upgrade = false;
    let mut has_connection_upgrade = false;
    for (k, v) in headers {
        if k.eq_ignore_ascii_case("sec-websocket-key") {
            has_key = true;
        }
        if k.eq_ignore_ascii_case("sec-websocket-version") {
            has_version = true;
        }
        if k.eq_ignore_ascii_case("upgrade") && v.eq_ignore_ascii_case("websocket") {
            has_upgrade = true;
        }
        if k.eq_ignore_ascii_case("connection") && v.to_ascii_lowercase().contains("upgrade") {
            has_connection_upgrade = true;
        }
    }
    has_key || has_version || (has_upgrade && has_connection_upgrade)
}

pub fn apply_websocket_target(session: &mut Session) {
    if session.scheme == "wss" || session.scheme == "ws" {
        return;
    }
    let ws_scheme = if session.scheme == "https" || session.url.starts_with("https://") {
        "wss"
    } else {
        "ws"
    };
    session.scheme = ws_scheme.to_string();
    session.is_https = ws_scheme == "wss";
    session.url = session
        .url
        .replacen("https://", "wss://", 1)
        .replacen("http://", "ws://", 1);
}

pub fn is_websocket_upgrade(headers: &http::HeaderMap) -> bool {
    is_websocket_handshake(&headers_from_http(headers))
}

pub fn user_agent_from_headers(headers: &http::HeaderMap) -> Option<String> {
    headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

pub fn headers_from_http(headers: &http::HeaderMap) -> Vec<(String, String)> {
    headers
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("<binary>").to_string()))
        .collect()
}

pub fn body_from_bytes(bytes: &[u8], content_type: Option<&str>, full_size: usize) -> HttpMessage {
    let truncated = full_size > bytes.len();
    let size = full_size;
    let is_binary = content_type
        .map(|ct| {
            ct.contains("octet-stream")
                || ct.starts_with("image/")
                || ct.starts_with("video/")
                || ct.starts_with("audio/")
                || ct.contains("application/pdf")
        })
        .unwrap_or(false)
        || !bytes.is_empty() && bytes.iter().take(512).any(|b| *b == 0);

    if is_binary {
        use base64::Engine;
        HttpMessage {
            headers: vec![],
            body: String::new(),
            body_base64: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
            is_binary: true,
            size,
            truncated,
        }
    } else {
        let body = String::from_utf8_lossy(bytes).into_owned();
        HttpMessage {
            headers: vec![],
            body,
            body_base64: None,
            is_binary: false,
            size,
            truncated,
        }
    }
}

pub fn decode_content_encoding(headers: &http::HeaderMap, body: Vec<u8>) -> Vec<u8> {
    let Some(enc) = headers
        .get("content-encoding")
        .and_then(|v| v.to_str().ok())
    else {
        return body;
    };
    let enc = enc.to_ascii_lowercase();
    if enc.contains("gzip") || enc.contains("x-gzip") {
        use std::io::Read;
        let mut decoder = flate2::read::GzDecoder::new(body.as_slice());
        let mut out = Vec::new();
        if decoder.read_to_end(&mut out).is_ok() {
            return out;
        }
        return body;
    }
    if enc.contains("deflate") {
        use std::io::Read;
        let mut decoder = flate2::read::DeflateDecoder::new(body.as_slice());
        let mut out = Vec::new();
        if decoder.read_to_end(&mut out).is_ok() {
            return out;
        }
    }
    body
}

pub fn capture_body_slice(full: &[u8]) -> Vec<u8> {
    if full.len() > MAX_BODY_BYTES {
        full[..MAX_BODY_BYTES].to_vec()
    } else {
        full.to_vec()
    }
}

#[cfg(test)]
mod ws_tests {
    use super::*;
    use http::HeaderMap;

    #[test]
    fn detects_sec_websocket_key() {
        let mut headers = HeaderMap::new();
        headers.insert("sec-websocket-key", "R6cNNAANWa1A37Wq9pUUMg==".parse().unwrap());
        headers.insert("sec-websocket-version", "13".parse().unwrap());
        assert!(is_websocket_upgrade(&headers));
    }

    #[test]
    fn detects_upgrade_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("upgrade", "websocket".parse().unwrap());
        headers.insert("connection", "Upgrade".parse().unwrap());
        assert!(is_websocket_upgrade(&headers));
    }

    #[test]
    fn ws_session_json_uses_camel_case() {
        let mut session = Session::new(
            "id".into(),
            "GET".into(),
            "wss://h.example/ws".into(),
            "h.example".into(),
            "/ws".into(),
            "wss".into(),
        );
        session.is_websocket = true;
        session.websocket_messages = vec![WebSocketMessage {
            direction: "client".into(),
            timestamp: chrono::Utc::now(),
            opcode: "text".into(),
            payload: "hello".into(),
            payload_base64: None,
            is_binary: false,
            size: 5,
            truncated: false,
        }];
        let json = serde_json::to_value(&session).unwrap();
        assert_eq!(json.get("isWebSocket").and_then(|v| v.as_bool()), Some(true));
        assert!(json.get("websocketMessages").and_then(|v| v.as_array()).is_some());
        assert!(json.get("isWebsocket").is_none());
    }

    #[test]
    fn apply_wss_from_https() {
        let mut session = Session::new(
            "id".into(),
            "GET".into(),
            "https://hmonitortest03.lkcoffee.com:443/luckyhmonitor/ws/track/report/web".into(),
            "hmonitortest03.lkcoffee.com".into(),
            "/luckyhmonitor/ws/track/report/web".into(),
            "https".into(),
        );
        apply_websocket_target(&mut session);
        assert_eq!(session.scheme, "wss");
        assert!(session.is_https);
        assert_eq!(
            session.url,
            "wss://hmonitortest03.lkcoffee.com:443/luckyhmonitor/ws/track/report/web"
        );
    }

    #[test]
    fn detects_upgrade_after_ensure_headers() {
        use hudsucker::hyper::{header, Request};

        let mut parts = Request::builder()
            .method("GET")
            .uri("https://hmonitortest03.lkcoffee.com/luckyhmonitor/ws/track/report/web")
            .version(http::Version::HTTP_11)
            .header("Sec-WebSocket-Key", "OxvNx1gfi8v5I6WtUhYAOA==")
            .header("Sec-WebSocket-Version", "13")
            .header(header::HOST, "hmonitortest03.lkcoffee.com")
            .body(())
            .unwrap()
            .into_parts()
            .0;

        assert!(!hyper_tungstenite::is_upgrade_request(&Request::from_parts(parts.clone(), ())));

        if !parts.headers.contains_key(header::UPGRADE) {
            parts.headers.insert(header::UPGRADE, "websocket".parse().unwrap());
        }
        let connection = parts
            .headers
            .get(header::CONNECTION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !connection.to_ascii_lowercase().contains("upgrade") {
            parts.headers.insert(header::CONNECTION, "Upgrade".parse().unwrap());
        }

        assert!(hyper_tungstenite::is_upgrade_request(&Request::from_parts(parts, ())));
    }
}

#[cfg(test)]
mod serde_tests {
    use super::*;

    #[test]
    fn http_message_serializes_camel_case() {
        let msg = HttpMessage {
            headers: vec![],
            body: "hello".into(),
            body_base64: None,
            is_binary: false,
            size: 5,
            truncated: false,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"bodyBase64\""), "{json}");
        assert!(json.contains("\"isBinary\""), "{json}");
    }
}
