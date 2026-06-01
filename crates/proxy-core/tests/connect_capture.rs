use std::sync::Arc;

use async_http_proxy::http_connect_tokio;
use proxy_core::rules::{AppRules, TlsFingerprintMode};
use proxy_core::{ProxyServer, SharedState};
use tokio::net::{TcpListener, TcpStream};

#[tokio::test]
async fn connect_captured_with_tls_fingerprint_auto() {
    let dir = tempfile::tempdir().unwrap();
    let state = Arc::new(SharedState::new(100, dir.path().to_path_buf()));
    {
        let mut rules = AppRules::default();
        rules.tls_fingerprint.mode = TlsFingerprintMode::Auto;
        *state.rules.write().await = rules;
    }

    let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_addr = upstream.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            if upstream.accept().await.is_err() {
                break;
            }
        }
    });

    let mut ps = ProxyServer::new();
    let port = 19878u16;
    ps.start(port, dir.path(), Arc::clone(&state))
        .await
        .expect("proxy start");
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let mut stream = TcpStream::connect(format!("127.0.0.1:{port}"))
        .await
        .unwrap();
    http_connect_tokio(
        &mut stream,
        &upstream_addr.ip().to_string(),
        upstream_addr.port(),
    )
    .await
    .expect("CONNECT must not be hijacked by specter");

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let sessions = state.sessions.read().await;
    let connect = sessions.values().find(|s| s.method == "CONNECT");
    assert!(
        connect.is_some(),
        "expected CONNECT session, got: {:?}",
        sessions
            .values()
            .map(|s| format!("{} {}", s.method, s.url))
            .collect::<Vec<_>>()
    );

    ps.stop().await;
}
