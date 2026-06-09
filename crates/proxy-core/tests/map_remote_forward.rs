use std::sync::Arc;

use hyper::header::HOST;
use proxy_core::map_remote::forward_map_remote_http;
use proxy_core::rules::{AppRules, MapRemoteRule, MapToTarget, MatchRule};
use proxy_core::{ProxyServer, SharedState};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

const MATCH_HOST: &str = "api.example.com";
const MATCH_PATH: &str = "/api/items/list";

async fn spawn_mock_upstream(body: &'static str) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let expect_host = format!("127.0.0.1:{port}");
    tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = listener.accept().await else {
                break;
            };
            let expect_host = expect_host.clone();
            tokio::spawn(async move {
                let mut buf = vec![0u8; 4096];
                let Ok(n) = stream.read(&mut buf).await else {
                    return;
                };
                let req = String::from_utf8_lossy(&buf[..n]);
                let host_ok = req
                    .lines()
                    .find(|l| l.to_ascii_lowercase().starts_with("host:"))
                    .is_some_and(|l| l.contains(&expect_host));
                let status = if host_ok { "200 OK" } else { "403 Forbidden" };
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len(),
                    body = body
                );
                let _ = stream.write_all(response.as_bytes()).await;
            });
        }
    });
    port
}

#[tokio::test]
async fn forward_uses_target_host_header() {
    let port = spawn_mock_upstream("mapped-ok").await;
    let mut headers = http::HeaderMap::new();
    headers.insert(
        HOST,
        MATCH_HOST.parse().unwrap(),
    );

    let (parts, body) = forward_map_remote_http(
        "GET",
        &format!("http://127.0.0.1:{port}{MATCH_PATH}"),
        &format!("127.0.0.1:{port}"),
        &headers,
        b"",
    )
    .await
    .expect("forward");

    assert_eq!(parts.status, 200);
    assert_eq!(body, b"mapped-ok");
}

#[tokio::test]
async fn proxy_map_remote_http_returns_local_upstream() {
    let body = "local-list";
    let upstream_port = spawn_mock_upstream(body).await;

    let dir = tempfile::tempdir().unwrap();
    let state = Arc::new(SharedState::new(100, dir.path().to_path_buf()));
    {
        let mut rules = AppRules::default();
        rules.map_remote.push(MapRemoteRule {
            id: "1".into(),
            enabled: true,
            name: "test".into(),
            order: 0,
            match_rule: MatchRule {
                protocol: Some("http".into()),
                host: MATCH_HOST.into(),
                path: Some("/api/**".into()),
            },
            map_to: MapToTarget {
                protocol: "http".into(),
                host: "127.0.0.1".into(),
                port: upstream_port,
                preserve_path: true,
                preserve_query: true,
                preserve_host: false,
            },
        });
        *state.rules.write().await = rules;
    }

    let mut ps = ProxyServer::new();
    let proxy_port = 19879u16;
    ps.start(proxy_port, dir.path(), Arc::clone(&state))
        .await
        .expect("proxy start");
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let mut stream = TcpStream::connect(format!("127.0.0.1:{proxy_port}"))
        .await
        .unwrap();
    let raw = format!(
        "GET http://{MATCH_HOST}{MATCH_PATH} HTTP/1.1\r\n\
         Host: {MATCH_HOST}\r\n\
         Proxy-Connection: keep-alive\r\n\
         Connection: close\r\n\r\n"
    );
    stream.write_all(raw.as_bytes()).await.unwrap();
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).await.unwrap();
    let resp = String::from_utf8_lossy(&resp);
    assert!(
        resp.contains("200"),
        "expected 200, got: {resp}"
    );
    assert!(
        resp.contains(body),
        "expected local body, got: {resp}"
    );

    ps.stop().await;
}

#[tokio::test]
async fn proxy_map_remote_uppercase_http_protocol() {
    let body = "local-upper";
    let upstream_port = spawn_mock_upstream(body).await;

    let dir = tempfile::tempdir().unwrap();
    let state = Arc::new(SharedState::new(100, dir.path().to_path_buf()));
    {
        let mut rules = AppRules::default();
        rules.map_remote.push(MapRemoteRule {
            id: "1".into(),
            enabled: true,
            name: "test".into(),
            order: 0,
            match_rule: MatchRule {
                protocol: Some("http".into()),
                host: MATCH_HOST.into(),
                path: Some("/api/**".into()),
            },
            map_to: MapToTarget {
                protocol: "HTTP".into(),
                host: "127.0.0.1".into(),
                port: upstream_port,
                preserve_path: true,
                preserve_query: true,
                preserve_host: false,
            },
        });
        *state.rules.write().await = rules;
    }

    let mut ps = ProxyServer::new();
    let proxy_port = 19880u16;
    ps.start(proxy_port, dir.path(), Arc::clone(&state))
        .await
        .expect("proxy start");
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let mut stream = TcpStream::connect(format!("127.0.0.1:{proxy_port}"))
        .await
        .unwrap();
    let raw = format!(
        "GET http://{MATCH_HOST}{MATCH_PATH} HTTP/1.1\r\n\
         Host: {MATCH_HOST}\r\n\
         Connection: close\r\n\r\n"
    );
    stream.write_all(raw.as_bytes()).await.unwrap();
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).await.unwrap();
    let resp = String::from_utf8_lossy(&resp);
    assert!(resp.contains("200"), "expected 200, got: {resp}");
    assert!(resp.contains(body), "expected local body, got: {resp}");

    ps.stop().await;
}

#[tokio::test]
async fn proxy_map_remote_https_target_on_private_host() {
    let body = "mitm-mapped";
    let upstream_port = spawn_mock_upstream(body).await;

    let dir = tempfile::tempdir().unwrap();
    let state = Arc::new(SharedState::new(100, dir.path().to_path_buf()));
    {
        let mut rules = AppRules::default();
        rules.map_remote.push(MapRemoteRule {
            id: "1".into(),
            enabled: true,
            name: "test".into(),
            order: 0,
            match_rule: MatchRule {
                protocol: Some("https".into()),
                host: MATCH_HOST.into(),
                path: Some("/api/**".into()),
            },
            map_to: MapToTarget {
                protocol: "https".into(),
                host: "127.0.0.1".into(),
                port: upstream_port,
                preserve_path: true,
                preserve_query: true,
                preserve_host: false,
            },
        });
        *state.rules.write().await = rules;
    }

    let mut ps = ProxyServer::new();
    let proxy_port = 19881u16;
    ps.start(proxy_port, dir.path(), Arc::clone(&state))
        .await
        .expect("proxy start");
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let mut stream = TcpStream::connect(format!("127.0.0.1:{proxy_port}"))
        .await
        .unwrap();
    let raw = format!(
        "GET https://{MATCH_HOST}{MATCH_PATH} HTTP/1.1\r\n\
         Host: {MATCH_HOST}\r\n\
         Connection: close\r\n\r\n"
    );
    stream.write_all(raw.as_bytes()).await.unwrap();
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).await.unwrap();
    let resp = String::from_utf8_lossy(&resp);
    assert!(resp.contains("200"), "expected 200, got: {resp}");
    assert!(resp.contains(body), "expected local body, got: {resp}");

    ps.stop().await;
}
