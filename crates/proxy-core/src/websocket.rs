use std::net::SocketAddr;

use chrono::Utc;
use hudsucker::hyper::{HeaderMap, Uri};
use hudsucker::tokio_tungstenite::tungstenite::Message;
use hudsucker::WebSocketContext;

use crate::session::{WebSocketMessage, Session, MAX_WS_MESSAGES, MAX_WS_PAYLOAD_BYTES};

pub fn ws_host_key(authority: &str) -> String {
    authority
        .strip_suffix(":443")
        .or_else(|| authority.strip_suffix(":80"))
        .unwrap_or(authority)
        .to_string()
}

fn ws_session_key(client_addr: SocketAddr, authority: &str, path: &str) -> String {
    format!("{client_addr}|{}|{path}", ws_host_key(authority))
}

pub fn ws_key_candidates_for(
    client_addr: SocketAddr,
    authority: &str,
    path_with_query: &str,
    path_only: &str,
) -> Vec<String> {
    let mut keys = vec![
        ws_session_key(client_addr, authority, path_with_query),
        ws_session_key(client_addr, authority, path_only),
    ];
    if path_with_query != path_only {
        keys.push(ws_session_key(
            client_addr,
            authority,
            path_only.trim_end_matches('/'),
        ));
    }
    if !authority.is_empty() {
        keys.push(ws_session_key(client_addr, "", path_with_query));
        keys.push(ws_session_key(client_addr, "", path_only));
    }
    keys.sort();
    keys.dedup();
    keys
}

pub fn ws_key_from_request(client_addr: SocketAddr, uri: &Uri, headers: &HeaderMap) -> String {
    let authority = headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .or_else(|| uri.authority().map(|a| a.as_str()))
        .unwrap_or("");
    let path_pq = uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let path = uri.path();
    ws_key_candidates_for(client_addr, authority, path_pq, path)
        .into_iter()
        .next()
        .unwrap_or_else(|| ws_session_key(client_addr, authority, path_pq))
}

pub fn ws_key_candidates(session: &Session) -> Vec<String> {
    let client_addr: SocketAddr = match session.client_addr.as_ref().and_then(|s| s.parse().ok()) {
        Some(a) => a,
        None => return vec![],
    };
    let authority = session
        .request
        .as_ref()
        .and_then(|r| {
            r.headers
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case("host"))
                .map(|(_, v)| v.clone())
        })
        .or_else(|| {
            session
                .url
                .parse::<Uri>()
                .ok()
                .and_then(|u| u.authority().map(|a| a.to_string()))
        })
        .unwrap_or_else(|| session.host.clone());
    let (path_pq, path_only) = session
        .url
        .parse::<Uri>()
        .ok()
        .map(|u| {
            let pq = u
                .path_and_query()
                .map(|p| p.as_str().to_string())
                .filter(|p| !p.is_empty())
                .unwrap_or_else(|| "/".to_string());
            let p = u.path().to_string();
            let p = if p.is_empty() { "/".to_string() } else { p };
            (pq, p)
        })
        .unwrap_or_else(|| {
            let p = if session.path.is_empty() {
                "/".to_string()
            } else {
                session.path.clone()
            };
            (p.clone(), p)
        });
    ws_key_candidates_for(client_addr, &authority, &path_pq, &path_only)
}

pub fn ws_keys_from_context(ctx: &WebSocketContext) -> Vec<String> {
    match ctx {
        WebSocketContext::ClientToServer { src, dst, .. } => ws_keys_from_uri(*src, dst),
        WebSocketContext::ServerToClient { src, dst, .. } => ws_keys_from_uri(*dst, src),
    }
}

fn ws_keys_from_uri(client_addr: SocketAddr, uri: &Uri) -> Vec<String> {
    let authority = uri.authority().map(|a| a.as_str()).unwrap_or("");
    let path_pq = uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let path = uri.path();
    ws_key_candidates_for(client_addr, authority, path_pq, path)
}

pub fn ws_context_target(ctx: &WebSocketContext) -> (String, String, String) {
    match ctx {
        WebSocketContext::ClientToServer { src, dst, .. } => {
            (src.to_string(), dst.host().unwrap_or("").to_string(), dst.path().to_string())
        }
        WebSocketContext::ServerToClient { src, dst, .. } => {
            (dst.to_string(), src.host().unwrap_or("").to_string(), src.path().to_string())
        }
    }
}

pub fn ws_direction(ctx: &WebSocketContext) -> &'static str {
    match ctx {
        WebSocketContext::ClientToServer { .. } => "client",
        WebSocketContext::ServerToClient { .. } => "server",
    }
}

pub fn ws_message_preview(msg: &WebSocketMessage, max: usize) -> String {
    if msg.is_binary {
        if let Some(b64) = &msg.payload_base64 {
            return format!("[binary b64={} raw_size={}]", b64.len(), msg.size);
        }
        return format!("[binary size={}]", msg.size);
    }
    if !msg.payload.is_empty() {
        let preview: String = msg.payload.chars().take(max).collect();
        if msg.payload.len() > max {
            return format!("{preview}…");
        }
        return preview;
    }
    if msg.opcode == "close" {
        return "(close)".into();
    }
    format!("({} empty payload, size={})", msg.opcode, msg.size)
}

pub fn message_kind(msg: &Message) -> &'static str {
    match msg {
        Message::Text(_) => "Text",
        Message::Binary(_) => "Binary",
        Message::Ping(_) => "Ping",
        Message::Pong(_) => "Pong",
        Message::Close(_) => "Close",
        Message::Frame(_) => "Frame",
    }
}

pub fn ws_message_from_frame(ctx: &WebSocketContext, msg: &Message) -> (WebSocketMessage, bool) {
    let (opcode, full_payload) = match msg {
        Message::Text(text) => ("text", text.as_bytes().to_vec()),
        Message::Binary(data) => ("binary", data.to_vec()),
        Message::Ping(data) => ("ping", data.to_vec()),
        Message::Pong(data) => ("pong", data.to_vec()),
        Message::Frame(frame) => {
            let payload = frame.payload().to_vec();
            tracing::warn!(
                opcode = ?frame.header().opcode,
                payload_len = payload.len(),
                "WebSocket raw Frame variant (payload may be unprocessed)"
            );
            ("frame", payload)
        }
        Message::Close(frame) => {
            let payload = frame
                .as_ref()
                .map(|f| f.reason.as_bytes().to_vec())
                .unwrap_or_default();
            ("close", payload)
        }
    };

    let truncated = full_payload.len() > MAX_WS_PAYLOAD_BYTES;
    let capture = if truncated {
        &full_payload[..MAX_WS_PAYLOAD_BYTES]
    } else {
        &full_payload[..]
    };
    let size = full_payload.len();
    let is_binary = matches!(opcode, "binary" | "ping" | "pong");

    let ws_msg = if is_binary && !capture.is_empty() {
        use base64::Engine;
        WebSocketMessage {
            direction: ws_direction(ctx).to_string(),
            timestamp: Utc::now(),
            opcode: opcode.to_string(),
            payload: String::new(),
            payload_base64: Some(base64::engine::general_purpose::STANDARD.encode(capture)),
            is_binary: true,
            size,
            truncated,
        }
    } else if opcode == "text" {
        WebSocketMessage {
            direction: ws_direction(ctx).to_string(),
            timestamp: Utc::now(),
            opcode: opcode.to_string(),
            payload: String::from_utf8_lossy(capture).into_owned(),
            payload_base64: None,
            is_binary: false,
            size,
            truncated,
        }
    } else {
        WebSocketMessage {
            direction: ws_direction(ctx).to_string(),
            timestamp: Utc::now(),
            opcode: opcode.to_string(),
            payload: String::new(),
            payload_base64: None,
            is_binary: false,
            size,
            truncated,
        }
    };

    let is_close = opcode == "close";
    (ws_msg, is_close)
}

pub fn trim_ws_messages(messages: &mut Vec<WebSocketMessage>) {
    if messages.len() > MAX_WS_MESSAGES {
        let drop = messages.len() - MAX_WS_MESSAGES;
        messages.drain(0..drop);
    }
}

pub fn paths_match(session_path: &str, target_path: &str) -> bool {
    if session_path == target_path {
        return true;
    }
    let a = session_path.trim_end_matches('/');
    let b = target_path.trim_end_matches('/');
    a == b || a.ends_with(b) || b.ends_with(a)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::{apply_websocket_target, HttpMessage, Session};
    use hudsucker::hyper::Uri;

    #[test]
    fn key_candidates_normalize_host_port() {
        let session = Session {
            id: "s1".into(),
            started_at: chrono::Utc::now(),
            method: "GET".into(),
            url: "wss://example.com:443/chat".into(),
            host: "example.com".into(),
            path: "/chat".into(),
            scheme: "wss".into(),
            is_https: true,
            status: Some(101),
            duration_ms: None,
            request_size: 0,
            response_size: None,
            request: Some(HttpMessage {
                headers: vec![("Host".into(), "example.com:443".into())],
                body: String::new(),
                body_base64: None,
                is_binary: false,
                size: 0,
                truncated: false,
            }),
            response: None,
            mapped_rule_id: None,
            mapped_rule_name: None,
            map_type: None,
            ssl_tunnel: false,
            completed: false,
            client_addr: Some("127.0.0.1:54321".into()),
            user_agent: None,
            client_name: "test".into(),
            tls_preset: None,
            is_websocket: true,
            websocket_messages: vec![],
        };
        let keys = ws_key_candidates(&session);
        let addr: SocketAddr = "127.0.0.1:54321".parse().unwrap();
        let ctx_key = ws_session_key(addr, "example.com", "/chat");
        assert!(keys.contains(&ctx_key));
    }

    #[test]
    fn ws_keys_align_with_wss_context() {
        let headers = vec![
            ("Upgrade".into(), "websocket".into()),
            ("Connection".into(), "Upgrade".into()),
            ("Sec-WebSocket-Key".into(), "OxvNx1gfi8v5I6WtUhYAOA==".into()),
            ("Sec-WebSocket-Version".into(), "13".into()),
            ("Host".into(), "ws.example.com".into()),
        ];
        let mut session = Session::new(
            "s1".into(),
            "GET".into(),
            "https://ws.example.com/app/ws/track/report/web".into(),
            "ws.example.com".into(),
            "/app/ws/track/report/web".into(),
            "https".into(),
        );
        session.is_websocket = true;
        session.client_addr = Some("127.0.0.1:54321".into());
        session.request = Some(HttpMessage {
            headers,
            body: String::new(),
            body_base64: None,
            is_binary: false,
            size: 0,
            truncated: false,
        });
        apply_websocket_target(&mut session);

        let addr: SocketAddr = "127.0.0.1:54321".parse().unwrap();
        let uri: Uri = "wss://ws.example.com/app/ws/track/report/web"
            .parse()
            .unwrap();
        let ctx_keys = ws_key_candidates_for(
            addr,
            uri.authority().map(|a| a.as_str()).unwrap_or(""),
            uri.path_and_query().map(|p| p.as_str()).unwrap_or("/"),
            uri.path(),
        );
        let session_keys = ws_key_candidates(&session);
        assert!(
            ctx_keys.iter().any(|k| session_keys.contains(k)),
            "ctx_keys={ctx_keys:?} session_keys={session_keys:?}"
        );
    }
}
