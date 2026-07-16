pub mod branding;
pub mod ca;
pub mod client_ua;
pub mod curl;
pub mod handler;
pub mod map_local;
pub mod map_remote;
pub mod matcher;
pub mod request_target;
pub mod rules;
pub mod server;
pub mod session;
pub mod state;
pub mod tls_fingerprint;
pub mod websocket;

use std::sync::Once;

pub use branding::*;
pub use curl::format_session_curl;
pub use matcher::{
    add_ssl_exclude_host, add_ssl_include_host, remove_ssl_exclude_host, remove_ssl_include_host,
    sanitize_ssl_config,
};
pub use rules::*;
pub use server::*;
pub use session::*;
pub use state::*;

static TRACING: Once = Once::new();

pub fn init_tracing() {
    TRACING.call_once(|| {
        let filter = tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "proxy_core=info,lk_debug_proxy=info,hudsucker=warn".into());
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_target(true)
            .init();
    });
}
