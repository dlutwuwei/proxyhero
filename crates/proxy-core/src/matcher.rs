use crate::rules::{MapLocalRule, MapRemoteRule, MatchRule, SslConfig, SslMode};
use glob::Pattern;

pub fn host_matches(pattern: &str, host: &str) -> bool {
    let pattern = pattern.trim().to_lowercase();
    let host = host.to_lowercase();
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
        if proto != "*" && proto != scheme {
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
    match ssl.mode {
        SslMode::Default => !ssl
            .exclude_hosts
            .iter()
            .any(|p| host_matches(p, host)),
        SslMode::Include => ssl
            .include_hosts
            .iter()
            .any(|p| host_matches(p, host)),
        SslMode::Exclude => !ssl
            .exclude_hosts
            .iter()
            .any(|p| host_matches(p, host)),
    }
}
