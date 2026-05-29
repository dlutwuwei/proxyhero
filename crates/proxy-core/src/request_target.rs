use hudsucker::hyper::{HeaderMap, Uri};

pub fn parse_host_from_header(value: &str) -> String {
    let v = value.trim();
    if let Some(rest) = v.strip_prefix('[') {
        if let Some(end) = rest.find(']') {
            return rest[..end].to_string();
        }
    }
    if let Some((host, _)) = v.rsplit_once(':') {
        if host.parse::<std::net::Ipv4Addr>().is_ok() {
            return host.to_string();
        }
    }
    v.split(':').next().unwrap_or(v).to_string()
}

fn port_from_host_header(headers: &HeaderMap) -> Option<u16> {
    let host = headers.get("host")?.to_str().ok()?.trim();
    if host.starts_with('[') {
        let rest = host.strip_prefix('[')?;
        let (_addr, tail) = rest.split_once(']')?;
        return tail.strip_prefix(':').and_then(|p| p.parse().ok());
    }
    host.rsplit_once(':')
        .and_then(|(left, port_str)| port_str.parse::<u16>().ok().filter(|_| !left.is_empty()))
}

fn resolve_port(uri: &Uri, headers: &HeaderMap) -> Option<u16> {
    uri.port_u16().or_else(|| port_from_host_header(headers))
}

fn tunnel_scheme(port: Option<u16>) -> &'static str {
    match port {
        Some(80) => "http",
        _ => "https",
    }
}

fn format_connect_authority(host: &str, port: Option<u16>) -> String {
    match port {
        Some(p) => format!("{host}:{p}"),
        None => format!("{host}:443"),
    }
}

pub fn resolve_request_target(
    method: &str,
    uri: &Uri,
    headers: &HeaderMap,
) -> (String, String, String, String) {
    let mut host = uri.host().unwrap_or("").to_string();
    if host.is_empty() {
        if let Some(h) = headers.get("host").and_then(|v| v.to_str().ok()) {
            host = parse_host_from_header(h);
        }
    }

    if method.eq_ignore_ascii_case("CONNECT") {
        let port = resolve_port(uri, headers);
        let scheme = tunnel_scheme(port).to_string();
        let authority = format_connect_authority(&host, port);
        let url = format!("{scheme}://{authority}");
        return (scheme, host, url, "/".to_string());
    }

    let scheme = uri
        .scheme_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "http".to_string());

    let path = uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/")
        .to_string();

    let url = if uri.scheme().is_some() {
        uri.to_string()
    } else if !host.is_empty() {
        format!("{scheme}://{host}{path}")
    } else {
        uri.to_string()
    };

    let path_only = uri.path().to_string();
    let path_only = if path_only.is_empty() {
        "/".to_string()
    } else {
        path_only
    };

    (scheme, host, url, path_only)
}

#[cfg(test)]
mod tests {
    use super::*;
    use hudsucker::hyper::header::HOST;

    #[test]
    fn ipv4_with_port() {
        assert_eq!(parse_host_from_header("192.168.1.10:8080"), "192.168.1.10");
    }

    #[test]
    fn ipv6_bracket() {
        assert_eq!(parse_host_from_header("[fe80::1]:8080"), "fe80::1");
    }

    #[test]
    fn connect_authority_443() {
        let uri: Uri = "api2.cursor.sh:443".parse().unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(HOST, "api2.cursor.sh:443".parse().unwrap());
        let (scheme, host, url, path) = resolve_request_target("CONNECT", &uri, &headers);
        assert_eq!(scheme, "https");
        assert_eq!(host, "api2.cursor.sh");
        assert_eq!(url, "https://api2.cursor.sh:443");
        assert_eq!(path, "/");
    }

    #[test]
    fn connect_default_https_without_explicit_port() {
        let uri: Uri = "www.doubao.com".parse().unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(HOST, "www.doubao.com:443".parse().unwrap());
        let (scheme, _, url, _) = resolve_request_target("CONNECT", &uri, &headers);
        assert_eq!(scheme, "https");
        assert_eq!(url, "https://www.doubao.com:443");
    }

    #[test]
    fn connect_port_80_uses_http() {
        let uri: Uri = "example.com:80".parse().unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(HOST, "example.com:80".parse().unwrap());
        let (scheme, _, url, _) = resolve_request_target("CONNECT", &uri, &headers);
        assert_eq!(scheme, "http");
        assert_eq!(url, "http://example.com:80");
    }

    #[test]
    fn plain_http_get_unchanged() {
        let uri: Uri = "http://example.com/api?q=1".parse().unwrap();
        let headers = HeaderMap::new();
        let (scheme, host, url, path) = resolve_request_target("GET", &uri, &headers);
        assert_eq!(scheme, "http");
        assert_eq!(host, "example.com");
        assert_eq!(url, "http://example.com/api?q=1");
        assert_eq!(path, "/api");
    }
}
