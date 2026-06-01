use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const MAX_BODY_BYTES: usize = 1024 * 1024;

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
        }
    }
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
