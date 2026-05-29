//! 修正 hudsucker 默认行为：IP 访问 HTTPS 须使用 IpAddress SAN，否则 Chrome 仍报不安全

use std::net::IpAddr;
use std::str::FromStr;
use std::sync::Arc;

use hudsucker::certificate_authority::CertificateAuthority;

const TTL_SECS: i64 = 365 * 24 * 60 * 60;
const CACHE_TTL: u64 = TTL_SECS as u64 / 2;
const NOT_BEFORE_OFFSET: i64 = 60;
use http::uri::Authority;
use hudsucker::rcgen::{
    string::Ia5String, CertificateParams, DistinguishedName, DnType, Issuer, KeyPair, SanType,
};
use hudsucker::rustls::crypto::CryptoProvider;
use hudsucker::rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use hudsucker::rustls::ServerConfig;
use moka::future::Cache;
use rand::rng;
use rand::Rng;
use time::{Duration, OffsetDateTime};
use tracing::debug;

pub struct IpAwareRcgenAuthority {
    issuer: Issuer<'static, KeyPair>,
    private_key: PrivateKeyDer<'static>,
    cache: Cache<Authority, Arc<ServerConfig>>,
    provider: Arc<CryptoProvider>,
}

impl IpAwareRcgenAuthority {
    pub fn new(
        issuer: Issuer<'static, KeyPair>,
        cache_size: u64,
        provider: CryptoProvider,
    ) -> Self {
        let private_key =
            PrivateKeyDer::from(PrivatePkcs8KeyDer::from(issuer.key().serialize_der()));
        Self {
            issuer,
            private_key,
            cache: Cache::builder()
                .max_capacity(cache_size)
                .time_to_live(std::time::Duration::from_secs(CACHE_TTL))
                .build(),
            provider: Arc::new(provider),
        }
    }

    fn gen_cert(&self, authority: &Authority) -> CertificateDer<'static> {
        let host = authority.host();
        let mut params = CertificateParams::default();
        params.serial_number = Some(rng().random::<u64>().into());

        let not_before = OffsetDateTime::now_utc() - Duration::seconds(NOT_BEFORE_OFFSET);
        params.not_before = not_before;
        params.not_after = not_before + Duration::seconds(TTL_SECS);

        let mut distinguished_name = DistinguishedName::new();
        distinguished_name.push(DnType::CommonName, host);
        params.distinguished_name = distinguished_name;

        if let Ok(ip) = IpAddr::from_str(host) {
            params.subject_alt_names.push(SanType::IpAddress(ip));
        } else {
            params.subject_alt_names.push(SanType::DnsName(
                Ia5String::try_from(host).expect("invalid dns name"),
            ));
        }

        params
            .signed_by(self.issuer.key(), &self.issuer)
            .expect("Failed to sign certificate")
            .into()
    }
}

impl CertificateAuthority for IpAwareRcgenAuthority {
    async fn gen_server_config(&self, authority: &Authority) -> Arc<ServerConfig> {
        if let Some(server_cfg) = self.cache.get(authority).await {
            debug!("Using cached server config");
            return server_cfg;
        }
        debug!("Generating server config for {}", authority.host());

        let certs = vec![self.gen_cert(authority)];

        let mut server_cfg = ServerConfig::builder_with_provider(Arc::clone(&self.provider))
            .with_safe_default_protocol_versions()
            .expect("protocol versions")
            .with_no_client_auth()
            .with_single_cert(certs, self.private_key.clone_key())
            .expect("build ServerConfig");

        server_cfg.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];

        let server_cfg = Arc::new(server_cfg);
        self.cache
            .insert(authority.clone(), Arc::clone(&server_cfg))
            .await;
        server_cfg
    }
}
