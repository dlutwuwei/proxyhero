use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;

use http_body_util::BodyExt;
use hudsucker::hyper::{header, Request, Response, StatusCode};
use http::HeaderValue;
use hudsucker::{
    Body, HttpContext, HttpHandler, RequestOrResponse, WebSocketContext, WebSocketHandler,
};
use hudsucker::tokio_tungstenite::tungstenite::Message;

use crate::branding::CA_CERT_FILE;
use crate::client_ua::client_label;
use crate::matcher::{find_map_local, find_map_remote, should_mitm_ssl};
use crate::request_target::{mitm_https_target, resolve_request_target};
use crate::rules::{is_map_target_allowed, TlsPreset};
use crate::session::{
    apply_websocket_target, body_from_bytes, capture_body_slice, decode_content_encoding,
    headers_from_http, is_websocket_handshake, is_websocket_upgrade, user_agent_from_headers,
    Session,
};
use crate::state::SharedState;
use crate::tls_fingerprint::{preset_name, specter_client};
use crate::websocket::{
    trim_ws_messages, ws_context_target, ws_keys_from_context, ws_message_from_frame,
    ws_message_preview, message_kind,
};

/// 每个 HTTP 事务使用独立的 handler 克隆（hudsucker `self.clone().proxy(req)`），
/// `active_session_id` 仅在本克隆的生命周期内有效，避免连接级 FIFO 在 HTTP/2 并发下错配。
pub struct CaptureHandler {
    pub state: Arc<SharedState>,
    active_session_id: Option<String>,
}

impl Clone for CaptureHandler {
    fn clone(&self) -> Self {
        Self {
            state: Arc::clone(&self.state),
            active_session_id: None,
        }
    }
}

impl CaptureHandler {
    pub fn new(state: Arc<SharedState>) -> Self {
        Self {
            state,
            active_session_id: None,
        }
    }

    fn ensure_ws_upgrade_headers(parts: &mut http::request::Parts) {
        if !parts.headers.contains_key(header::UPGRADE) {
            parts.headers.insert(
                header::UPGRADE,
                HeaderValue::from_static("websocket"),
            );
        }
        let connection = parts
            .headers
            .get(header::CONNECTION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !connection.to_ascii_lowercase().contains("upgrade") {
            let new_val = if connection.is_empty() {
                "Upgrade".to_string()
            } else {
                format!("{connection}, Upgrade")
            };
            if let Ok(v) = HeaderValue::from_str(&new_val) {
                parts.headers.insert(header::CONNECTION, v);
            }
        }
    }

    fn is_ws_upgrade_request(parts: &http::request::Parts) -> bool {
        let probe = Request::from_parts(parts.clone(), ());
        hyper_tungstenite::is_upgrade_request(&probe)
    }

    async fn forward_with_specter(
        &self,
        session_id: &str,
        method: &str,
        url: &str,
        headers: &http::HeaderMap,
        body: &[u8],
        preset: &TlsPreset,
        started: Instant,
    ) -> Response<Body> {
        let client = specter_client(preset);

        let http_method = http::Method::from_bytes(method.as_bytes()).unwrap_or(http::Method::GET);
        let mut req = match http_method {
            http::Method::GET => client.get(url),
            http::Method::POST => client.post(url),
            http::Method::PUT => client.put(url),
            http::Method::DELETE => client.delete(url),
            http::Method::PATCH => client.patch(url),
            http::Method::HEAD => client.head(url),
            _ => client.request(http_method, url),
        };

        for (name, value) in headers.iter() {
            let skip = matches!(
                name.as_str(),
                "host" | "connection" | "proxy-connection" | "transfer-encoding" | "content-length"
            );
            if skip {
                continue;
            }
            if let Ok(v) = value.to_str() {
                req = req.header(name.as_str(), v);
            }
        }

        if !body.is_empty() {
            req = req.body(body.to_vec());
        }

        match req.send().await {
            Ok(specter_res) => {
                let status = specter_res.status_code();
                let mut builder = Response::builder().status(status);
                for (k, v) in specter_res.headers().iter() {
                    builder = builder.header(k, v);
                }
                let res_body = specter_res.bytes().unwrap_or_default();
                let res = builder.body(Body::from(res_body.to_vec())).unwrap();
                Self::capture_response_body(
                    &self.state,
                    session_id,
                    res,
                    started.elapsed().as_millis() as u64,
                )
                .await
            }
            Err(e) => {
                tracing::warn!("specter forward failed for {url}: {e}");
                let err_body = format!(r#"{{"error":"tls fingerprint forward failed: {e}"}}"#);
                let res = Response::builder()
                    .status(StatusCode::BAD_GATEWAY)
                    .header("content-type", "application/json")
                    .body(Body::from(err_body))
                    .unwrap();
                Self::capture_response_body(&self.state, session_id, res, 0).await
            }
        }
    }

    async fn read_full_body(body: Body) -> Vec<u8> {
        match body.collect().await {
            Ok(collected) => collected.to_bytes().to_vec(),
            Err(_) => vec![],
        }
    }

    async fn apply_response(
        state: &SharedState,
        session_id: &str,
        parts: &http::response::Parts,
        capture_body: &[u8],
        wire_len: usize,
        duration_ms: u64,
    ) {
        let content_type = parts
            .headers
            .get("content-type")
            .and_then(|v| v.to_str().ok());
        let mut sessions = state.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.status = Some(parts.status.as_u16());
            session.duration_ms = Some(duration_ms);
            session.response_size = Some(wire_len);
            let mut res_msg = body_from_bytes(capture_body, content_type, wire_len);
            res_msg.headers = headers_from_http(&parts.headers);
            session.response = Some(res_msg);

            if parts.status.as_u16() == 101 && !session.is_websocket {
                let from_req = session
                    .request
                    .as_ref()
                    .map(|r| is_websocket_handshake(&r.headers))
                    .unwrap_or(false);
                if from_req {
                    session.is_websocket = true;
                    apply_websocket_target(session);
                    tracing::info!(
                        session_id = %session_id,
                        url = %session.url,
                        "WebSocket session marked from 101 response"
                    );
                }
            }

            session.completed = true;

            let updated = session.clone();
            drop(sessions);
            if updated.is_websocket {
                state.register_ws_session_aliases(&updated).await;
            }
            state.upsert_session(updated).await;
        }
    }

    async fn capture_response_body(
        state: &SharedState,
        session_id: &str,
        res: Response<Body>,
        duration_ms: u64,
    ) -> Response<Body> {
        let (parts, body) = res.into_parts();
        let raw_body = Self::read_full_body(body).await;
        let wire_len = raw_body.len();
        let decoded_body = decode_content_encoding(&parts.headers, raw_body.clone());
        let capture_body = capture_body_slice(&decoded_body);
        let out = Response::from_parts(parts.clone(), Body::from(raw_body));
        Self::apply_response(
            state,
            session_id,
            &parts,
            &capture_body,
            wire_len,
            duration_ms,
        )
        .await;
        out
    }
}

impl HttpHandler for CaptureHandler {
    async fn should_intercept(&mut self, _ctx: &HttpContext, req: &Request<Body>) -> bool {
        let (_, host, _, _) = resolve_request_target(
            req.method().as_str(),
            req.uri(),
            req.headers(),
        );
        if host.is_empty() {
            return true;
        }
        let rules = self.state.rules.read().await;
        should_mitm_ssl(&rules.ssl, &host)
    }

    async fn handle_request(&mut self, ctx: &HttpContext, req: Request<Body>) -> RequestOrResponse {
        // 检查是否是证书下载请求
        let path = req.uri().path();
        if path == "/proxyhero/ca.crt" || path == "/ca.crt" {
            let cert_path = self.state.cert_dir.join(CA_CERT_FILE);
            if let Ok(content) = tokio::fs::read(&cert_path).await {
                let res = Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "application/x-x509-ca-cert")
                    .header(
                        header::CONTENT_DISPOSITION,
                        "attachment; filename=\"proxyhero-ca.crt\"",
                    )
                    .body(Body::from(content))
                    .unwrap();
                self.active_session_id = None;
                return RequestOrResponse::Response(res);
            }
        }

        let started = Instant::now();
        let (mut parts, body) = req.into_parts();
        let raw_body = Self::read_full_body(body).await;
        let wire_len = raw_body.len();
        let decoded_body = decode_content_encoding(&parts.headers, raw_body.clone());
        let capture_body = capture_body_slice(&decoded_body);
        let body = Body::from(raw_body);

        let method = parts.method.to_string();
        let uri = parts.uri.clone();
        let (mut scheme, host, mut url, path_str) =
            resolve_request_target(&method, &uri, &parts.headers);

        let rules = self.state.rules.read().await.clone();
        let ssl_tunnel = !should_mitm_ssl(&rules.ssl, &host);

        if let Some((s, u)) = mitm_https_target(&scheme, &host, &uri, &parts.headers, ssl_tunnel) {
            scheme = s;
            url = u;
        }

        let session_id = uuid::Uuid::new_v4().to_string();
        self.active_session_id = Some(session_id.clone());

        let content_type = parts
            .headers
            .get("content-type")
            .and_then(|v| v.to_str().ok());
        let mut session = Session::new(
            session_id.clone(),
            method.clone(),
            url.clone(),
            host.clone(),
            path_str.clone(),
            scheme.clone(),
        );
        session.ssl_tunnel = ssl_tunnel;
        session.client_addr = Some(ctx.client_addr.to_string());
        let user_agent = user_agent_from_headers(&parts.headers);
        session.user_agent = user_agent.clone();
        session.client_name = client_label(user_agent.as_deref());
        session.request_size = wire_len;
        let mut req_msg = body_from_bytes(&capture_body, content_type, wire_len);
        req_msg.headers = headers_from_http(&parts.headers);

        if is_websocket_handshake(&req_msg.headers) || is_websocket_upgrade(&parts.headers) {
            parts.version = http::Version::HTTP_11;
            Self::ensure_ws_upgrade_headers(&mut parts);
            req_msg.headers = headers_from_http(&parts.headers);
        }
        let has_ws_hint =
            is_websocket_handshake(&req_msg.headers) || is_websocket_upgrade(&parts.headers);
        let is_ws = Self::is_ws_upgrade_request(&parts);

        session.request = Some(req_msg);
        if has_ws_hint || is_ws {
            session.is_websocket = true;
            apply_websocket_target(&mut session);
        }
        let is_connect = method.eq_ignore_ascii_case("CONNECT");
        if is_connect {
            session.status = Some(200);
            tracing::info!(
                host = %host,
                client = %ctx.client_addr,
                ssl_tunnel,
                mitm = !ssl_tunnel,
                "CONNECT request"
            );
            if ssl_tunnel {
                tracing::warn!(
                    host = %host,
                    client = %ctx.client_addr,
                    "CONNECT ssl_tunnel: WSS traffic will not be MITM'd, WebSocket capture disabled"
                );
            }
        }
        if is_ws {
            session.status = Some(101);
            session.completed = false;
            tracing::info!(
                session_id = %session_id,
                url = %session.url,
                host = %host,
                path = %path_str,
                client = %ctx.client_addr,
                ssl_tunnel,
                has_ws_hint,
                "WebSocket upgrade request captured, waiting for frames"
            );
            self.state.register_ws_session_aliases(&session).await;
        } else if has_ws_hint && !is_ws {
            tracing::warn!(
                url = %url,
                host = %host,
                client = %ctx.client_addr,
                "WebSocket headers detected but hyper_tungstenite rejected upgrade"
            );
        }

        self.state.upsert_session(session.clone()).await;

        if !is_ws {
            if let Some(local_rule) = find_map_local(&rules.map_local, &scheme, &host, &path_str) {
            session.mapped_rule_id = Some(local_rule.id.clone());
            session.mapped_rule_name = Some(local_rule.name.clone());
            session.map_type = Some("local".into());
            self.state.upsert_session(session).await;

            let content = match tokio::fs::read(&local_rule.local_file).await {
                Ok(c) => c,
                Err(e) => {
                    let err_body = format!(r#"{{"error":"map local failed: {e}"}}"#);
                    let res = Response::builder()
                        .status(502)
                        .header("content-type", "application/json")
                        .body(Body::from(err_body))
                        .unwrap();
                    let res = Self::capture_response_body(
                        &self.state,
                        &session_id,
                        res,
                        started.elapsed().as_millis() as u64,
                    )
                    .await;
                    self.active_session_id = None;
                    return RequestOrResponse::Response(res);
                }
            };
            let mut builder = Response::builder().status(local_rule.status);
            for (k, v) in &local_rule.headers {
                builder = builder.header(k.as_str(), v.as_str());
            }
            if local_rule.headers.get("content-type").is_none() {
                builder = builder.header("content-type", "application/octet-stream");
            }
            let res = builder.body(Body::from(content)).unwrap();
            let res = Self::capture_response_body(
                &self.state,
                &session_id,
                res,
                started.elapsed().as_millis() as u64,
            )
            .await;
            self.active_session_id = None;
            return RequestOrResponse::Response(res);
            }
        }

        // Map Remote 改写（在 TLS 指纹转发前也要生效）
        let mut upstream_url = url.clone();
        if let Some(remote_rule) = find_map_remote(&rules.map_remote, &scheme, &host, &path_str) {
            if is_map_target_allowed(&remote_rule.map_to.host, &rules.allowed_map_hosts) {
                session.mapped_rule_id = Some(remote_rule.id.clone());
                session.mapped_rule_name = Some(remote_rule.name.clone());
                session.map_type = Some("remote".into());

                let map = &remote_rule.map_to;
                let path_and_query = if map.preserve_path {
                    uri.path_and_query()
                        .map(|pq| pq.as_str())
                        .unwrap_or("/")
                        .to_string()
                } else {
                    "/".to_string()
                };
                upstream_url = format!(
                    "{}://{}:{}{}",
                    map.protocol, map.host, map.port, path_and_query
                );
                session.url = upstream_url.clone();
            }
        }

        // TLS 指纹模式：用 specter 客户端直接向上游发请求（CONNECT / WebSocket 必须走 hudsucker 代理链路）
        let tls_preset = rules.tls_fingerprint.resolved_preset(user_agent.as_deref());
        if let Some(ref preset) = tls_preset {
            if upstream_url.starts_with("https://") && !ssl_tunnel && !is_ws && !is_connect {
                session.tls_preset = Some(preset_name(preset).to_string());
                self.state.upsert_session(session).await;

                let res = self
                    .forward_with_specter(
                        &session_id,
                        &method,
                        &upstream_url,
                        &parts.headers,
                        &capture_body,
                        preset,
                        started,
                    )
                    .await;
                self.active_session_id = None;
                return RequestOrResponse::Response(res);
            }
        }

        let req = Request::from_parts(parts, body);

        self.state.upsert_session(session).await;
        RequestOrResponse::Request(req)
    }

    async fn handle_response(&mut self, _ctx: &HttpContext, res: Response<Body>) -> Response<Body> {
        let started = Instant::now();
        let session_id = match self.active_session_id.take() {
            Some(id) => id,
            None => return res,
        };

        let (parts, body) = res.into_parts();
        let raw_body = Self::read_full_body(body).await;
        let wire_len = raw_body.len();
        let decoded_body = decode_content_encoding(&parts.headers, raw_body.clone());
        let capture_body = capture_body_slice(&decoded_body);
        let out = Response::from_parts(parts.clone(), Body::from(raw_body));

        Self::apply_response(
            &self.state,
            &session_id,
            &parts,
            &capture_body,
            wire_len,
            started.elapsed().as_millis() as u64,
        )
        .await;

        out
    }

    async fn handle_error(
        &mut self,
        _ctx: &HttpContext,
        _err: hyper_util::client::legacy::Error,
    ) -> Response<Body> {
        let session_id = match self.active_session_id.take() {
            Some(id) => id,
            None => {
                return Response::builder()
                    .status(StatusCode::BAD_GATEWAY)
                    .body(Body::empty())
                    .expect("build response");
            }
        };

        let res = Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .header("content-type", "application/json")
            .body(Body::from(r#"{"error":"upstream request failed"}"#))
            .expect("build response");

        Self::capture_response_body(&self.state, &session_id, res, 0).await
    }
}

impl WebSocketHandler for CaptureHandler {
    async fn handle_message(
        &mut self,
        ctx: &WebSocketContext,
        message: Message,
    ) -> Option<Message> {
        let ctx_keys = ws_keys_from_context(ctx);
        let (client_addr, host, path) = ws_context_target(ctx);
        tracing::debug!(
            client = %client_addr,
            host = %host,
            path = %path,
            ctx_keys = ?ctx_keys,
            "WebSocket frame received"
        );

        let session_id = match self.state.resolve_ws_session_id(ctx).await {
            Some(id) => id,
            None => {
                tracing::warn!(
                    client = %client_addr,
                    host = %host,
                    path = %path,
                    ctx_keys = ?ctx_keys,
                    "WebSocket frame: no matching session"
                );
                return Some(message);
            }
        };

        let (ws_msg, is_close) = ws_message_from_frame(ctx, &message);
        tracing::info!(
            session_id = %session_id,
            raw_kind = message_kind(&message),
            direction = %ws_msg.direction,
            opcode = %ws_msg.opcode,
            size = ws_msg.size,
            payload_len = ws_msg.payload.len(),
            has_base64 = ws_msg.payload_base64.is_some(),
            is_close,
            preview = %ws_message_preview(&ws_msg, 160),
            "WebSocket frame captured"
        );
        {
            let mut sessions = self.state.sessions.write().await;
            let Some(session) = sessions.get_mut(&session_id) else {
                tracing::warn!(
                    session_id = %session_id,
                    "WebSocket frame: session id resolved but missing from store"
                );
                return Some(message);
            };
            session.websocket_messages.push(ws_msg);
            trim_ws_messages(&mut session.websocket_messages);
            let msg_count = session.websocket_messages.len();
            if is_close {
                session.completed = true;
                session.duration_ms = Some(
                    (Utc::now() - session.started_at)
                        .num_milliseconds()
                        .max(0) as u64,
                );
            }
            let updated = session.clone();
            drop(sessions);
            tracing::debug!(
                session_id = %session_id,
                msg_count,
                completed = updated.completed,
                "WebSocket session store updated, emitting to UI"
            );
            self.state.register_ws_session_aliases(&updated).await;
            if is_close {
                self.state.unregister_ws_session(&session_id).await;
            }
            self.state.upsert_session(updated).await;
        }
        Some(message)
    }
}
