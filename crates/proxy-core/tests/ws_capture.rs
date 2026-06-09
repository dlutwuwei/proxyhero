use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;

use async_http_proxy::http_connect_tokio;
use futures::{SinkExt, StreamExt};
use hudsucker::certificate_authority::CertificateAuthority;
use hudsucker::hyper::service::service_fn;
use hudsucker::hyper::{Request, Response, StatusCode};
use hudsucker::hyper_util::rt::{TokioExecutor, TokioIo};
use hudsucker::hyper_util::server::conn::auto;
use hudsucker::rcgen::{
    BasicConstraints, CertificateParams, DnType, IsCa, Issuer, KeyPair, KeyUsagePurpose,
};
use hudsucker::rustls::crypto::aws_lc_rs;
use hudsucker::tokio_tungstenite::tungstenite::{Message, Utf8Bytes};
use hudsucker::tokio_tungstenite;
use hudsucker::Body;
use proxy_core::ca::IpAwareRcgenAuthority;
use proxy_core::{cert_paths, ensure_ca_files, ProxyServer, SharedState};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use time::{Duration, OffsetDateTime};

const HELLO: Utf8Bytes = Utf8Bytes::from_static("hello");
const WORLD: Utf8Bytes = Utf8Bytes::from_static("world");
const WS_PATH: &str = "/app/ws/track/report/web";

async fn ws_echo_server(
    req: Request<hudsucker::hyper::body::Incoming>,
) -> Result<Response<Body>, std::convert::Infallible> {
    if hyper_tungstenite::is_upgrade_request(&req) {
        let (res, ws) = hyper_tungstenite::upgrade(req, None).unwrap();
        tokio::spawn(async move {
            let mut ws = ws.await.unwrap();
            while let Some(msg) = ws.next().await {
                let msg = msg.unwrap();
                if msg.is_close() {
                    break;
                }
                ws.send(Message::Text(WORLD)).await.unwrap();
            }
        });
        return Ok(res.map(Body::from));
    }
    Ok(Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Body::empty())
        .unwrap())
}

async fn start_ws_server() -> (SocketAddr, oneshot::Sender<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, mut rx) = oneshot::channel();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                res = listener.accept() => {
                    let (tcp, _) = res.unwrap();
                    let server = auto::Builder::new(TokioExecutor::new());
                    tokio::spawn(async move {
                        server
                            .serve_connection_with_upgrades(TokioIo::new(tcp), service_fn(ws_echo_server))
                            .await
                            .unwrap();
                    });
                }
                _ = &mut rx => break,
            }
        }
    });
    (addr, tx)
}

fn create_test_ca(cert_dir: &Path) -> IpAwareRcgenAuthority {
    std::fs::create_dir_all(cert_dir).unwrap();
    let (cert_path, key_path) = cert_paths(cert_dir);
    if !cert_path.exists() {
        let mut params = CertificateParams::new(vec![]).unwrap();
        let now = OffsetDateTime::now_utc();
        params.not_before = now - Duration::days(1);
        params.not_after = now + Duration::days(365 * 10);
        params
            .distinguished_name
            .push(DnType::CommonName, "ProxyHero Test CA");
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![
            hudsucker::rcgen::KeyUsagePurpose::KeyCertSign,
            hudsucker::rcgen::KeyUsagePurpose::CrlSign,
        ];
        let key_pair = KeyPair::generate().unwrap();
        let cert = params.self_signed(&key_pair).unwrap();
        std::fs::write(cert_path, cert.pem()).unwrap();
        std::fs::write(key_path, key_pair.serialize_pem()).unwrap();
    }
    ensure_ca_files(cert_dir).unwrap();
    let (cert_path, key_path) = cert_paths(cert_dir);
    let cert_pem = std::fs::read_to_string(cert_path).unwrap();
    let key_pem = std::fs::read_to_string(key_path).unwrap();
    let key_pair = KeyPair::from_pem(&key_pem).unwrap();
    let issuer = Issuer::from_ca_cert_pem(&cert_pem, key_pair).unwrap();
    IpAwareRcgenAuthority::new(issuer, 100, aws_lc_rs::default_provider())
}

async fn assert_ws_captured(state: &SharedState) {
    let sessions = state.sessions.read().await;
    let ws_session = sessions.values().find(|s| s.is_websocket);
    assert!(
        ws_session.is_some(),
        "expected websocket session, got: {:?}",
        sessions
            .values()
            .map(|s| format!("{} ws={} scheme={}", s.url, s.is_websocket, s.scheme))
            .collect::<Vec<_>>()
    );
    let ws_session = ws_session.unwrap();
    assert!(ws_session.url.contains(WS_PATH));
    assert!(ws_session.request.is_some());
    assert!(!ws_session.websocket_messages.is_empty());
}

#[tokio::test]
async fn captures_websocket_session_and_messages() {
    let dir = tempfile::tempdir().unwrap();
    let state = Arc::new(SharedState::new(100, dir.path().to_path_buf()));
    let (server_addr, stop_server) = start_ws_server().await;

    let mut ps = ProxyServer::new();
    let port = 19876u16;
    ps.start(port, dir.path(), Arc::clone(&state))
        .await
        .expect("proxy start");
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let mut stream = TcpStream::connect(format!("127.0.0.1:{port}"))
        .await
        .unwrap();
    http_connect_tokio(
        &mut stream,
        &server_addr.ip().to_string(),
        server_addr.port(),
    )
    .await
    .unwrap();

    let url = format!("ws://{server_addr}{WS_PATH}");
    let (mut ws, _) = tokio_tungstenite::client_async(url, stream).await.unwrap();
    ws.send(Message::Text(HELLO)).await.unwrap();
    assert_eq!(ws.next().await.unwrap().unwrap().into_text().unwrap(), WORLD);
    ws.close(None).await.ok();

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    assert_ws_captured(&state).await;

    let _ = stop_server;
    ps.stop().await;
}

#[test]
fn mitm_alpn_prefers_http1_for_websocket() {
    let dir = tempfile::tempdir().unwrap();
    let ca = create_test_ca(dir.path());
    let rt = tokio::runtime::Runtime::new().unwrap();
    let cfg = rt.block_on(ca.gen_server_config(&"localhost".parse().unwrap()));
    assert_eq!(cfg.alpn_protocols, vec![b"http/1.1".to_vec()]);
}
