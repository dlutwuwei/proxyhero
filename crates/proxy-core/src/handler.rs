use std::sync::Arc;
use std::time::Instant;

use http_body_util::BodyExt;
use hudsucker::hyper::{header, Request, Response, StatusCode, Uri};
use hudsucker::{Body, HttpContext, HttpHandler, RequestOrResponse};

use crate::branding::CA_CERT_FILE;
use crate::client_ua::client_label;
use crate::matcher::{find_map_local, find_map_remote, should_mitm_ssl};
use crate::request_target::resolve_request_target;
use crate::rules::is_map_target_allowed;
use crate::session::{
    body_from_bytes, capture_body_slice, decode_content_encoding, headers_from_http,
    user_agent_from_headers, Session,
};
use crate::state::SharedState;

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
            session.completed = true;
            let updated = session.clone();
            drop(sessions);
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
        let host = req.uri().host().unwrap_or("").to_string();
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
        let (parts, body) = req.into_parts();
        let raw_body = Self::read_full_body(body).await;
        let wire_len = raw_body.len();
        let decoded_body = decode_content_encoding(&parts.headers, raw_body.clone());
        let capture_body = capture_body_slice(&decoded_body);
        let body = Body::from(raw_body);

        let method = parts.method.to_string();
        let uri = parts.uri.clone();
        let (scheme, host, url, path_str) = resolve_request_target(&method, &uri, &parts.headers);

        let rules = self.state.rules.read().await.clone();
        let ssl_tunnel = !should_mitm_ssl(&rules.ssl, &host);

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
        session.request = Some(req_msg);

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

        let mut req = Request::from_parts(parts, body);

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
                let new_uri = format!(
                    "{}://{}:{}{}",
                    map.protocol, map.host, map.port, path_and_query
                );
                if let Ok(parsed) = new_uri.parse::<Uri>() {
                    *req.uri_mut() = parsed;
                    session.url = req.uri().to_string();
                }
            }
        }

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
