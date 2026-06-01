use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::{broadcast, RwLock};

use crate::rules::AppRules;
use crate::session::{Session, SessionEvent};
use crate::websocket::{paths_match, ws_context_target, ws_host_key, ws_key_candidates, ws_keys_from_context, ws_message_preview};

#[derive(Clone)]
pub struct SharedState {
    pub rules: Arc<RwLock<AppRules>>,
    pub sessions: Arc<RwLock<HashMap<String, Session>>>,
    pub session_order: Arc<RwLock<Vec<String>>>,
    pub ws_session_keys: Arc<RwLock<HashMap<String, String>>>,
    pub capture_paused: Arc<AtomicBool>,
    pub max_sessions: usize,
    pub event_tx: broadcast::Sender<SessionEvent>,
    pub cert_dir: Arc<PathBuf>,
}

impl SharedState {
    pub fn new(max_sessions: usize, cert_dir: PathBuf) -> Self {
        let (event_tx, _) = broadcast::channel(65536);
        Self {
            rules: Arc::new(RwLock::new(AppRules::default())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            session_order: Arc::new(RwLock::new(Vec::new())),
            ws_session_keys: Arc::new(RwLock::new(HashMap::new())),
            capture_paused: Arc::new(AtomicBool::new(false)),
            max_sessions,
            event_tx,
            cert_dir: Arc::new(cert_dir),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SessionEvent> {
        self.event_tx.subscribe()
    }

    pub fn emit(&self, event: SessionEvent) {
        let _ = self.event_tx.send(event);
    }

    pub async fn upsert_session(&self, session: Session) {
        if self.capture_paused.load(Ordering::Relaxed) {
            return;
        }
        let id = session.id.clone();
        let is_new = {
            let map = self.sessions.read().await;
            !map.contains_key(&id)
        };
        {
            let mut map = self.sessions.write().await;
            map.insert(id.clone(), session.clone());
        }
        if is_new {
            let mut order = self.session_order.write().await;
            order.push(id.clone());
            while order.len() > self.max_sessions {
                if let Some(old_id) = order.first().cloned() {
                    order.remove(0);
                    self.sessions.write().await.remove(&old_id);
                }
            }
            if session.is_websocket {
                tracing::info!(
                    session_id = %id,
                    url = %session.url,
                    msg_count = session.websocket_messages.len(),
                    "WebSocket session created"
                );
            }
            self.emit(SessionEvent::Created { session });
        } else {
            if session.is_websocket && !session.websocket_messages.is_empty() {
                let last = session.websocket_messages.last().unwrap();
                tracing::info!(
                    session_id = %id,
                    msg_count = session.websocket_messages.len(),
                    completed = session.completed,
                    last_opcode = %last.opcode,
                    last_size = last.size,
                    preview = %ws_message_preview(last, 160),
                    "WebSocket session persisted"
                );
            }
            self.emit(SessionEvent::Updated {
                session: session.clone(),
            });
            if session.completed {
                self.emit(SessionEvent::Completed { session });
            }
        }
    }

    pub async fn clear_sessions(&self) {
        self.sessions.write().await.clear();
        self.session_order.write().await.clear();
        self.ws_session_keys.write().await.clear();
    }

    pub async fn clear_session(&self, session_id: &str) {
        self.sessions.write().await.remove(session_id);
        self.session_order
            .write()
            .await
            .retain(|id| id != session_id);
        self.ws_session_keys
            .write()
            .await
            .retain(|_, id| id != session_id);
    }

    pub async fn register_ws_session(&self, key: String, session_id: String) {
        self.ws_session_keys.write().await.insert(key, session_id);
    }

    pub async fn register_ws_session_aliases(&self, session: &Session) {
        let id = session.id.clone();
        let keys = ws_key_candidates(session);
        let mut map = self.ws_session_keys.write().await;
        for key in keys.iter() {
            map.insert(key.clone(), id.clone());
        }
        tracing::debug!(
            session_id = %id,
            url = %session.url,
            keys = ?keys,
            "registered WebSocket session aliases"
        );
    }

    pub async fn unregister_ws_session(&self, session_id: &str) {
        self.ws_session_keys
            .write()
            .await
            .retain(|_, id| id != session_id);
    }

    pub async fn ws_session_id(&self, key: &str) -> Option<String> {
        self.ws_session_keys.read().await.get(key).cloned()
    }

    pub async fn resolve_ws_session_id(&self, ctx: &hudsucker::WebSocketContext) -> Option<String> {
        let ctx_keys = ws_keys_from_context(ctx);
        for key in &ctx_keys {
            if let Some(id) = self.ws_session_id(key).await {
                tracing::debug!(key = %key, session_id = %id, "WebSocket session matched by key");
                return Some(id);
            }
        }

        let (client_addr, host, path) = ws_context_target(ctx);
        let target_host = ws_host_key(&host);
        let sessions = self.sessions.read().await;
        let found = sessions.iter().find_map(|(id, s)| {
            if !s.is_websocket {
                return None;
            }
            if s.client_addr.as_deref() != Some(client_addr.as_str()) {
                return None;
            }
            let session_host = ws_host_key(&s.host);
            let req_host = s.request.as_ref().and_then(|r| {
                r.headers
                    .iter()
                    .find(|(k, _)| k.eq_ignore_ascii_case("host"))
                    .map(|(_, v)| ws_host_key(v))
            });
            let host_ok = target_host.is_empty()
                || session_host == target_host
                || req_host.as_deref() == Some(&target_host)
                || s.host.eq_ignore_ascii_case(&host);
            if !host_ok {
                return None;
            }
            if paths_match(&s.path, &path) {
                return Some(id.clone());
            }
            s.url
                .parse::<hudsucker::hyper::Uri>()
                .ok()
                .map(|u| u.path().to_string())
                .filter(|p| paths_match(p, &path))
                .map(|_| id.clone())
        });
        if found.is_none() {
            let ws_sessions: Vec<String> = sessions
                .values()
                .filter(|s| s.is_websocket)
                .map(|s| {
                    format!(
                        "{}|{}|{}",
                        s.client_addr.as_deref().unwrap_or(""),
                        s.host,
                        s.path
                    )
                })
                .collect();
            tracing::debug!(
                client = %client_addr,
                host = %host,
                path = %path,
                ctx_keys = ?ctx_keys,
                ws_sessions = ?ws_sessions,
                "WebSocket session fallback match failed"
            );
        }
        found
    }
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use hudsucker::hyper::Uri;

    use crate::session::{apply_websocket_target, HttpMessage, Session};
    use crate::websocket::ws_key_candidates_for;

    use super::SharedState;

    fn luckin_session(id: &str, client: &str) -> Session {
        let headers = vec![
            ("Upgrade".into(), "websocket".into()),
            ("Connection".into(), "Upgrade".into()),
            ("Sec-WebSocket-Key".into(), "OxvNx1gfi8v5I6WtUhYAOA==".into()),
            ("Sec-WebSocket-Version".into(), "13".into()),
            ("Sec-WebSocket-Extensions".into(), "permessage-deflate; client_max_window_bits".into()),
            ("Host".into(), "hmonitortest03.lkcoffee.com".into()),
            ("User-Agent".into(), "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)".into()),
        ];
        let mut session = Session::new(
            id.into(),
            "GET".into(),
            "https://hmonitortest03.lkcoffee.com/luckyhmonitor/ws/track/report/web".into(),
            "hmonitortest03.lkcoffee.com".into(),
            "/luckyhmonitor/ws/track/report/web".into(),
            "https".into(),
        );
        session.is_websocket = true;
        session.client_addr = Some(client.into());
        session.request = Some(HttpMessage {
            headers,
            body: String::new(),
            body_base64: None,
            is_binary: false,
            size: 0,
            truncated: false,
        });
        apply_websocket_target(&mut session);
        session
    }

    #[tokio::test]
    async fn luckin_resolve_ws_session_by_alias() {
        let state = SharedState::new(100, std::env::temp_dir());
        let session = luckin_session("luckin-1", "192.168.1.10:54321");
        state.register_ws_session_aliases(&session).await;
        state
            .sessions
            .write()
            .await
            .insert(session.id.clone(), session);

        let addr: SocketAddr = "192.168.1.10:54321".parse().unwrap();
        let uri: Uri = "wss://hmonitortest03.lkcoffee.com/luckyhmonitor/ws/track/report/web"
            .parse()
            .unwrap();
        let keys = ws_key_candidates_for(
            addr,
            uri.authority().map(|a| a.as_str()).unwrap_or(""),
            uri.path_and_query().map(|p| p.as_str()).unwrap_or("/"),
            uri.path(),
        );
        let mut found = None;
        for key in keys {
            if let Some(id) = state.ws_session_id(&key).await {
                found = Some(id);
                break;
            }
        }
        assert_eq!(found.as_deref(), Some("luckin-1"));
    }

    #[tokio::test]
    async fn luckin_resolve_ws_session_fallback_by_host_path() {
        let state = SharedState::new(100, std::env::temp_dir());
        let session = luckin_session("luckin-2", "192.168.1.10:54321");
        state
            .sessions
            .write()
            .await
            .insert(session.id.clone(), session);

        let sessions = state.sessions.read().await;
        let target_host = "hmonitortest03.lkcoffee.com";
        let target_path = "/luckyhmonitor/ws/track/report/web";
        let found = sessions.iter().find_map(|(id, s)| {
            if !s.is_websocket {
                return None;
            }
            if s.client_addr.as_deref() != Some("192.168.1.10:54321") {
                return None;
            }
            if s.host != target_host {
                return None;
            }
            if s.path == target_path {
                return Some(id.clone());
            }
            None
        });
        assert_eq!(found.as_deref(), Some("luckin-2"));
    }

    #[test]
    fn luckin_hudsucker_upgrade_headers() {
        use http::HeaderMap;
        use hudsucker::hyper::{header, Request};

        let mut headers = HeaderMap::new();
        headers.insert(header::UPGRADE, "websocket".parse().unwrap());
        headers.insert(header::CONNECTION, "Upgrade".parse().unwrap());
        headers.insert("sec-websocket-key", "OxvNx1gfi8v5I6WtUhYAOA==".parse().unwrap());
        headers.insert("sec-websocket-version", "13".parse().unwrap());
        headers.insert(
            "sec-websocket-extensions",
            "permessage-deflate; client_max_window_bits".parse().unwrap(),
        );
        headers.insert(header::HOST, "hmonitortest03.lkcoffee.com".parse().unwrap());

        let req = Request::builder()
            .method("GET")
            .uri("https://hmonitortest03.lkcoffee.com/luckyhmonitor/ws/track/report/web")
            .version(http::Version::HTTP_11)
            .header(header::UPGRADE, "websocket")
            .header(header::CONNECTION, "Upgrade")
            .header("Sec-WebSocket-Key", "OxvNx1gfi8v5I6WtUhYAOA==")
            .header("Sec-WebSocket-Version", "13")
            .body(())
            .unwrap();

        assert!(hyper_tungstenite::is_upgrade_request(&req));

        let addr: SocketAddr = "192.168.1.10:54321".parse().unwrap();
        let keys = ws_key_candidates_for(
            addr,
            headers.get(header::HOST).unwrap().to_str().unwrap(),
            "/luckyhmonitor/ws/track/report/web",
            "/luckyhmonitor/ws/track/report/web",
        );
        assert!(!keys.is_empty());
    }
}
