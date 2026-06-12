use std::sync::OnceLock;

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;

use crate::rules::MapToTarget;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapRemoteForward {
    pub connect_url: String,
    pub host_header: String,
    pub target_protocol: String,
}

fn normalize_map_host(host: &str) -> String {
    let host = host.trim();
    if host.eq_ignore_ascii_case("localhost") {
        "127.0.0.1".to_string()
    } else {
        host.to_string()
    }
}

fn is_private_map_host(host: &str) -> bool {
    if host == "127.0.0.1" {
        return true;
    }
    if host.starts_with("10.") || host.starts_with("192.168.") {
        return true;
    }
    if host.starts_with("172.") {
        if let Some(octet) = host.split('.').nth(1).and_then(|s| s.parse::<u8>().ok()) {
            return (16..=31).contains(&octet);
        }
    }
    host.parse::<std::net::IpAddr>()
        .ok()
        .is_some_and(|ip| ip.is_loopback())
}

fn effective_target_protocol(map: &MapToTarget, host: &str) -> String {
    let proto = map.protocol.trim().to_ascii_lowercase();
    if proto == "https" && is_private_map_host(host) {
        tracing::warn!(
            target_host = %host,
            port = map.port,
            "map remote target uses https on private host, coercing to http"
        );
        return "http".to_string();
    }
    if proto.is_empty() {
        return "http".to_string();
    }
    proto
}

fn target_host_header(host: &str, port: u16) -> String {
    format!("{host}:{port}")
}

pub fn build_map_remote_forward(
    map: &MapToTarget,
    uri: &hudsucker::hyper::Uri,
    original_host: &str,
) -> MapRemoteForward {
    let host = normalize_map_host(&map.host);
    let target_protocol = effective_target_protocol(map, &host);
    let path_and_query = if map.preserve_path {
        uri.path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/")
            .to_string()
    } else {
        "/".to_string()
    };
    let host_header = if map.preserve_host {
        original_host.to_string()
    } else {
        target_host_header(&host, map.port)
    };
    MapRemoteForward {
        connect_url: format!("{target_protocol}://{host}:{}{path_and_query}", map.port),
        host_header,
        target_protocol,
    }
}

pub fn map_remote_uses_direct_http(forward: &MapRemoteForward) -> bool {
    forward.target_protocol == "http"
}

pub fn map_remote_origin(forward: &MapRemoteForward) -> String {
    format!("{}://{}", forward.target_protocol, forward.host_header)
}

pub fn apply_map_remote_ws_headers(headers: &mut http::HeaderMap, forward: &MapRemoteForward) {
    let origin = map_remote_origin(forward);
    if let Ok(host_val) = http::HeaderValue::from_str(&forward.host_header) {
        headers.insert(http::header::HOST, host_val);
    }
    if let Ok(origin_val) = http::HeaderValue::from_str(&origin) {
        headers.insert(http::header::ORIGIN, origin_val);
    }
    if headers.contains_key(http::header::REFERER) {
        if let Ok(ref_val) = http::HeaderValue::from_str(&format!("{origin}/")) {
            headers.insert(http::header::REFERER, ref_val);
        }
    }
}

fn should_skip_forward_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "host"
            | "connection"
            | "keep-alive"
            | "proxy-connection"
            | "proxy-authorization"
            | "transfer-encoding"
            | "content-length"
            | "te"
            | "upgrade"
            | "http2-settings"
    )
}

fn map_remote_http_client() -> &'static Client<HttpConnector, Full<Bytes>> {
    static CLIENT: OnceLock<Client<HttpConnector, Full<Bytes>>> = OnceLock::new();
    CLIENT.get_or_init(|| Client::builder(TokioExecutor::new()).build(HttpConnector::new()))
}

pub async fn forward_map_remote_http(
    method: &str,
    connect_url: &str,
    host_header: &str,
    headers: &http::HeaderMap,
    body: &[u8],
) -> Result<(http::response::Parts, Vec<u8>), String> {
    let http_method = http::Method::from_bytes(method.as_bytes()).unwrap_or(http::Method::GET);
    let uri: http::Uri = connect_url
        .parse()
        .map_err(|e| format!("invalid map remote url {connect_url}: {e}"))?;

    let mut builder = http::Request::builder().method(http_method).uri(uri);
    for (name, value) in headers.iter() {
        if should_skip_forward_header(name.as_str()) {
            continue;
        }
        let Ok(v) = value.to_str() else {
            continue;
        };
        builder = builder.header(name.as_str(), v);
    }
    builder = builder.header(http::header::HOST, host_header);

    let req = builder
        .body(Full::new(Bytes::copy_from_slice(body)))
        .map_err(|e| e.to_string())?;

    let res = map_remote_http_client()
        .request(req)
        .await
        .map_err(|e| format!("connect {connect_url} failed: {e}"))?;

    let (parts, res_body) = res.into_parts();
    let raw_body = res_body
        .collect()
        .await
        .map(|c| c.to_bytes().to_vec())
        .unwrap_or_default();
    Ok((parts, raw_body))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(protocol: &str, host: &str, port: u16) -> MapToTarget {
        MapToTarget {
            protocol: protocol.into(),
            host: host.into(),
            port,
            preserve_path: true,
            preserve_query: true,
            preserve_host: false,
        }
    }

    #[test]
    fn default_uses_target_host_header() {
        let uri: hudsucker::hyper::Uri = "/api/items/list".parse().unwrap();
        let forward = build_map_remote_forward(
            &target("http", "127.0.0.1", 9000),
            &uri,
            "api.example.com",
        );
        assert_eq!(forward.host_header, "127.0.0.1:9000");
    }

    #[test]
    fn preserve_host_keeps_original_header() {
        let uri: hudsucker::hyper::Uri = "/api".parse().unwrap();
        let mut map = target("http", "127.0.0.1", 9000);
        map.preserve_host = true;
        let forward = build_map_remote_forward(&map, &uri, "api.example.com");
        assert_eq!(forward.host_header, "api.example.com");
    }

    #[test]
    fn mitm_inner_path_to_local_http() {
        let uri: hudsucker::hyper::Uri = "/api/items/list?page=1".parse().unwrap();
        let forward = build_map_remote_forward(
            &target("http", "127.0.0.1", 9000),
            &uri,
            "api.example.com",
        );
        assert_eq!(
            forward.connect_url,
            "http://127.0.0.1:9000/api/items/list?page=1"
        );
        assert!(map_remote_uses_direct_http(&forward));
    }

    #[test]
    fn localhost_normalized_to_loopback() {
        let uri: hudsucker::hyper::Uri = "/api".parse().unwrap();
        let forward = build_map_remote_forward(
            &target("http", "localhost", 9000),
            &uri,
            "example.com",
        );
        assert_eq!(forward.connect_url, "http://127.0.0.1:9000/api");
    }

    #[test]
    fn private_host_https_coerced_to_http() {
        let uri: hudsucker::hyper::Uri = "/api".parse().unwrap();
        let forward = build_map_remote_forward(
            &target("https", "127.0.0.1", 9000),
            &uri,
            "api.example.com",
        );
        assert_eq!(forward.connect_url, "http://127.0.0.1:9000/api");
        assert!(map_remote_uses_direct_http(&forward));
    }

    #[test]
    fn protocol_case_insensitive_for_direct_http() {
        let uri: hudsucker::hyper::Uri = "/api".parse().unwrap();
        let forward = build_map_remote_forward(
            &target("HTTP", "127.0.0.1", 9000),
            &uri,
            "example.com",
        );
        assert_eq!(forward.connect_url, "http://127.0.0.1:9000/api");
        assert!(map_remote_uses_direct_http(&forward));
    }
}
