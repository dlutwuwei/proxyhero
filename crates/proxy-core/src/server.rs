use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use crate::branding::{CA_CERT_FILE, CA_COMMON_NAME, CA_KEY_FILE, CA_ORG_NAME};
use crate::ca::IpAwareRcgenAuthority;
use hudsucker::rcgen::{
    BasicConstraints, CertificateParams, DnType, IsCa, Issuer, KeyPair, KeyUsagePurpose,
};
use hudsucker::rustls::crypto::aws_lc_rs;
use hudsucker::Proxy;
use time::{Duration as TimeDuration, OffsetDateTime};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::handler::CaptureHandler;
use crate::state::SharedState;
use crate::init_tracing;

pub struct ProxyServer {
    handle: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl ProxyServer {
    pub fn new() -> Self {
        Self {
            handle: None,
            shutdown_tx: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.handle.as_ref().is_some_and(|h| !h.is_finished())
    }

    pub async fn start(
        &mut self,
        port: u16,
        cert_dir: &Path,
        state: Arc<SharedState>,
    ) -> Result<(), String> {
        if self.is_running() {
            return Err("proxy already running".into());
        }
        // 清理已退出但仍占位的 handle
        self.handle = None;
        self.shutdown_tx = None;

        init_tracing();
        tracing::info!(port, "starting proxy server");

        let ca = load_or_create_ca(cert_dir)?;
        let handler = CaptureHandler::new(state);
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("bind {addr}: {e}"))?;
        let (tx, rx) = oneshot::channel::<()>();
        let proxy = Proxy::builder()
            .with_listener(listener)
            .with_ca(ca)
            .with_rustls_connector(aws_lc_rs::default_provider())
            .with_http_handler(handler.clone())
            .with_websocket_handler(handler)
            .with_graceful_shutdown(async move {
                let _ = rx.await;
            })
            .build()
            .map_err(|e| e.to_string())?;

        let handle = tokio::spawn(async move {
            if let Err(e) = proxy.start().await {
                tracing::error!("proxy error: {e}");
            }
        });

        self.shutdown_tx = Some(tx);
        self.handle = Some(handle);
        Ok(())
    }

    pub async fn stop(&mut self) {
        self.stop_inner(false).await;
    }

    pub async fn stop_forced(&mut self) {
        self.stop_inner(true).await;
    }

    async fn stop_inner(&mut self, force: bool) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(mut handle) = self.handle.take() {
            if force {
                handle.abort();
                let _ = handle.await;
            } else {
                tokio::select! {
                    _ = &mut handle => {}
                    _ = tokio::time::sleep(Duration::from_millis(800)) => {
                        handle.abort();
                        let _ = handle.await;
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(if force { 80 } else { 50 })).await;
    }
}

fn load_or_create_ca(cert_dir: &Path) -> Result<IpAwareRcgenAuthority, String> {
    std::fs::create_dir_all(cert_dir).map_err(|e| e.to_string())?;
    let cert_path = cert_dir.join(CA_CERT_FILE);
    let key_path = cert_dir.join(CA_KEY_FILE);

    if !cert_path.exists() || !key_path.exists() || ca_needs_regenerate(&cert_path) {
        if cert_path.exists() {
            let _ = std::fs::remove_file(&cert_path);
            let _ = std::fs::remove_file(&key_path);
        }
        let mut params = CertificateParams::new(vec![]).map_err(|e| e.to_string())?;
        let now = OffsetDateTime::now_utc();
        params.not_before = now - TimeDuration::days(1);
        params.not_after = now + TimeDuration::days(365 * 10);
        params
            .distinguished_name
            .push(DnType::CommonName, CA_COMMON_NAME);
        params
            .distinguished_name
            .push(DnType::OrganizationName, CA_ORG_NAME);
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
        let key_pair = KeyPair::generate().map_err(|e| e.to_string())?;
        let cert = params.self_signed(&key_pair).map_err(|e| e.to_string())?;
        std::fs::write(&cert_path, cert.pem()).map_err(|e| e.to_string())?;
        std::fs::write(&key_path, key_pair.serialize_pem()).map_err(|e| e.to_string())?;
    }

    let cert_pem = std::fs::read_to_string(&cert_path).map_err(|e| e.to_string())?;
    let key_pem = std::fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
    let key_pair = KeyPair::from_pem(&key_pem).map_err(|e| e.to_string())?;
    let issuer = Issuer::from_ca_cert_pem(&cert_pem, key_pair).map_err(|e| e.to_string())?;

    Ok(IpAwareRcgenAuthority::new(
        issuer,
        1_000,
        aws_lc_rs::default_provider(),
    ))
}

pub fn ensure_ca_files(cert_dir: &Path) -> Result<(), String> {
    let _ = load_or_create_ca(cert_dir)?;
    Ok(())
}

/// rcgen 默认 CA 有效期为 1975–4096，Chrome 可能拒绝配合未正确标记 SSL 信任的根证书
fn ca_needs_regenerate(cert_path: &Path) -> bool {
    let Ok(pem) = std::fs::read_to_string(cert_path) else {
        return false;
    };
    pem.contains("750101") || pem.contains("40960101")
}

pub fn cert_paths(cert_dir: &Path) -> (std::path::PathBuf, std::path::PathBuf) {
    (cert_dir.join(CA_CERT_FILE), cert_dir.join(CA_KEY_FILE))
}
