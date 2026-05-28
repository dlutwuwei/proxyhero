use std::sync::Arc;

use proxy_core::{ProxyServer, SharedState};

#[tokio::test]
async fn proxy_start_stop() {
    let dir = tempfile::tempdir().expect("tempdir");
    let state = Arc::new(SharedState::new(100, dir.path().to_path_buf()));
    let mut server = ProxyServer::new();
    server
        .start(18888, dir.path(), state)
        .await
        .expect("start");
    assert!(server.is_running());
    server.stop().await;
    assert!(!server.is_running());
}
