use crate::rules::{MapLocalRule, MapRemoteRule, MatchRule, SslConfig, SslMode};
use glob::Pattern;

pub fn normalize_host(value: &str) -> String {
    let mut v = value.trim().to_lowercase();
    if let Some(rest) = v.strip_prefix("https://") {
        v = rest.to_string();
    } else if let Some(rest) = v.strip_prefix("http://") {
        v = rest.to_string();
    }
    if let Some((host, _)) = v.split_once('/') {
        v = host.to_string();
    }
    let v = v.trim_end_matches('/').to_string();
    if v.starts_with('[') {
        return v;
    }
    if let Some((host, port)) = v.rsplit_once(':') {
        if !host.is_empty() && port.chars().all(|c| c.is_ascii_digit()) {
            return host.to_string();
        }
    }
    v
}

pub fn host_matches(pattern: &str, host: &str) -> bool {
    let pattern = normalize_host(pattern);
    let host = normalize_host(host);
    if pattern == host {
        return true;
    }
    if let Some(suffix) = pattern.strip_prefix("*.") {
        return host == suffix || host.ends_with(&format!(".{suffix}"));
    }
    if pattern.contains('*') || pattern.contains('?') {
        if let Ok(p) = Pattern::new(&pattern) {
            return p.matches(&host);
        }
    }
    false
}

pub fn path_matches(pattern: Option<&str>, path: &str) -> bool {
    let Some(pattern) = pattern else {
        return true;
    };
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern == "**" || pattern == "/**" {
        return true;
    }
    let glob_pat = if pattern.contains("**") {
        pattern.to_string()
    } else if pattern.ends_with('*') {
        format!("{pattern}")
    } else {
        pattern.to_string()
    };
    Pattern::new(&glob_pat)
        .map(|p| p.matches(path))
        .unwrap_or(path == pattern || path.starts_with(pattern.trim_end_matches('*')))
}

pub fn match_rule_matches(rule: &MatchRule, scheme: &str, host: &str, path: &str) -> bool {
    if let Some(ref proto) = rule.protocol {
        let proto = proto.trim();
        if proto != "*"
            && !proto.eq_ignore_ascii_case(scheme)
        {
            return false;
        }
    }
    if !host_matches(&rule.host, host) {
        return false;
    }
    path_matches(rule.path.as_deref(), path)
}

pub fn find_map_remote<'a>(
    rules: &'a [MapRemoteRule],
    scheme: &str,
    host: &str,
    path: &str,
) -> Option<&'a MapRemoteRule> {
    let mut sorted: Vec<_> = rules.iter().filter(|r| r.enabled).collect();
    sorted.sort_by_key(|r| r.order);
    sorted
        .into_iter()
        .find(|r| match_rule_matches(&r.match_rule, scheme, host, path))
}

pub fn find_map_local<'a>(
    rules: &'a [MapLocalRule],
    scheme: &str,
    host: &str,
    path: &str,
) -> Option<&'a MapLocalRule> {
    let mut sorted: Vec<_> = rules.iter().filter(|r| r.enabled).collect();
    sorted.sort_by_key(|r| r.order);
    sorted
        .into_iter()
        .find(|r| match_rule_matches(&r.match_rule, scheme, host, path))
}

pub fn should_mitm_ssl(ssl: &SslConfig, host: &str) -> bool {
    let host = normalize_host(host);
    if host.is_empty() {
        return false;
    }

    let in_include = ssl
        .include_hosts
        .iter()
        .any(|p| host_matches(p, &host));
    if !in_include {
        return false;
    }

    // 精确 Include 始终解密，避免曾写入 Exclude 后无法再解密
    let exact_include = ssl.include_hosts.iter().any(|p| {
        let p = normalize_host(p);
        !p.contains('*') && !p.contains('?') && p == host
    });
    if exact_include {
        return true;
    }

    // 通配 Include 可被 Exclude 裁剪
    !ssl.exclude_hosts.iter().any(|p| host_matches(p, &host))
}

fn dedupe_hosts(hosts: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for host in hosts {
        if !out.contains(&host) {
            out.push(host);
        }
    }
    out
}

fn sanitize_ssl_host_list(list: &[String]) -> Vec<String> {
    dedupe_hosts(
        list.iter()
            .map(|h| normalize_host(h))
            .filter(|h| !h.is_empty())
            .collect(),
    )
}

pub fn sanitize_ssl_config(ssl: &mut SslConfig) {
    ssl.include_hosts = sanitize_ssl_host_list(&ssl.include_hosts);
    ssl.exclude_hosts = sanitize_ssl_host_list(&ssl.exclude_hosts);
}

pub fn add_ssl_include_host(ssl: &mut SslConfig, host: &str) {
    let host = normalize_host(host);
    if host.is_empty() {
        return;
    }
    remove_ssl_exclude_host(ssl, &host);
    if ssl.include_hosts.iter().any(|p| host_matches(p, &host)) {
        return;
    }
    ssl.include_hosts.push(host);
}

pub fn add_ssl_exclude_host(ssl: &mut SslConfig, host: &str) {
    let host = normalize_host(host);
    if host.is_empty() {
        return;
    }
    remove_ssl_include_host(ssl, &host);
    if ssl.exclude_hosts.iter().any(|p| host_matches(p, &host)) {
        return;
    }
    ssl.exclude_hosts.push(host);
}

pub fn remove_ssl_exclude_host(ssl: &mut SslConfig, host: &str) {
    let host = normalize_host(host);
    if host.is_empty() {
        return;
    }
    ssl.exclude_hosts.retain(|p| {
        if p.contains('*') || p.contains('?') {
            return true;
        }
        !host_matches(p, &host)
    });
}

pub fn remove_ssl_include_host(ssl: &mut SslConfig, host: &str) {
    let host = normalize_host(host);
    if host.is_empty() {
        return;
    }
    ssl.include_hosts.retain(|p| {
        if p.contains('*') || p.contains('?') {
            return true;
        }
        !host_matches(p, &host)
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_matches_ignores_trailing_slash_and_scheme() {
        assert!(host_matches(
            "trackstream.example.com/",
            "trackstream.example.com"
        ));
        assert!(host_matches(
            "https://trackstream.example.com/",
            "trackstream.example.com"
        ));
    }

    #[test]
    fn sanitize_strips_url_path_from_exclude() {
        let mut ssl = SslConfig {
            enabled: true,
            mode: SslMode::Default,
            include_hosts: vec![],
            exclude_hosts: vec![
                "https://adminsalesfetest03.lkcoffee.com/tentacle/displaySpace/list/popTactics"
                    .into(),
            ],
        };
        sanitize_ssl_config(&mut ssl);
        assert_eq!(
            ssl.exclude_hosts,
            vec!["adminsalesfetest03.lkcoffee.com".to_string()]
        );
        assert!(!should_mitm_ssl(&ssl, "adminsalesfetest03.lkcoffee.com"));
    }

    #[test]
    fn add_and_remove_ssl_exclude_host() {
        let mut ssl = SslConfig::default();
        add_ssl_exclude_host(
            &mut ssl,
            "https://adminsalesfetest03.lkcoffee.com/path",
        );
        assert!(ssl
            .exclude_hosts
            .contains(&"adminsalesfetest03.lkcoffee.com".to_string()));
        remove_ssl_exclude_host(&mut ssl, "adminsalesfetest03.lkcoffee.com");
        assert!(!ssl
            .exclude_hosts
            .contains(&"adminsalesfetest03.lkcoffee.com".to_string()));
    }

    #[test]
    fn ssl_disabled_only_includes_mitm() {
        let ssl = SslConfig {
            enabled: false,
            mode: SslMode::Default,
            include_hosts: vec!["api.example.com".into()],
            exclude_hosts: vec![],
        };
        assert!(!should_mitm_ssl(&ssl, "other.example.com"));
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
    }

    #[test]
    fn ssl_default_mode_only_includes_mitm() {
        let ssl = SslConfig {
            enabled: true,
            mode: SslMode::Default,
            include_hosts: vec!["api.example.com".into()],
            exclude_hosts: vec![],
        };
        assert!(!should_mitm_ssl(&ssl, "other.example.com"));
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
    }

    #[test]
    fn ssl_exact_include_wins_over_exclude() {
        let ssl = SslConfig {
            enabled: true,
            mode: SslMode::Default,
            include_hosts: vec!["api.example.com".into()],
            exclude_hosts: vec!["api.example.com".into()],
        };
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
    }

    #[test]
    fn ssl_wildcard_include_can_be_carved_by_exclude() {
        let ssl = SslConfig {
            enabled: true,
            mode: SslMode::Default,
            include_hosts: vec!["*.example.com".into()],
            exclude_hosts: vec!["ads.example.com".into()],
        };
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
        assert!(!should_mitm_ssl(&ssl, "ads.example.com"));
    }

    #[test]
    fn ssl_exclude_mode_still_only_includes_mitm() {
        let ssl = SslConfig {
            enabled: true,
            mode: SslMode::Exclude,
            include_hosts: vec!["api.example.com".into()],
            exclude_hosts: vec!["*.apple.com".into()],
        };
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
        assert!(!should_mitm_ssl(&ssl, "other.example.com"));
        assert!(!should_mitm_ssl(&ssl, "foo.apple.com"));
    }

    #[test]
    fn ssl_remove_from_include_stops_mitm() {
        let mut ssl = SslConfig {
            enabled: true,
            mode: SslMode::Exclude,
            include_hosts: vec!["api.example.com".into()],
            exclude_hosts: vec![],
        };
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
        remove_ssl_include_host(&mut ssl, "api.example.com");
        assert!(!should_mitm_ssl(&ssl, "api.example.com"));
    }

    #[test]
    fn ssl_add_include_after_exclude_decrypts() {
        let mut ssl = SslConfig {
            enabled: true,
            mode: SslMode::Default,
            include_hosts: vec![],
            exclude_hosts: vec!["api.example.com".into()],
        };
        assert!(!should_mitm_ssl(&ssl, "api.example.com"));
        add_ssl_include_host(&mut ssl, "api.example.com");
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
        assert!(!ssl.exclude_hosts.iter().any(|h| h == "api.example.com"));
    }

    #[test]
    fn ssl_wildcard_include_needs_exclude_to_disable() {
        let mut ssl = SslConfig {
            enabled: false,
            mode: SslMode::Default,
            include_hosts: vec!["*.example.com".into()],
            exclude_hosts: vec![],
        };
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
        remove_ssl_include_host(&mut ssl, "api.example.com");
        assert!(should_mitm_ssl(&ssl, "api.example.com"));
        add_ssl_exclude_host(&mut ssl, "api.example.com");
        assert!(!should_mitm_ssl(&ssl, "api.example.com"));
    }

    #[test]
    fn path_matches_exact_api_path() {
        assert!(path_matches(
            Some("/api/employee/currentUser"),
            "/api/employee/currentUser"
        ));
    }
}
