/// 从 User-Agent 解析可读客户端名称；无 UA 时统一为「无标识」。
pub fn client_label(user_agent: Option<&str>) -> String {
    if let Some(ua) = user_agent.filter(|s| !s.trim().is_empty()) {
        if let Some(name) = parse_user_agent(ua) {
            return name;
        }
        return truncate_ua(ua);
    }
    "无标识".into()
}

fn truncate_ua(ua: &str) -> String {
    const MAX: usize = 48;
    if ua.len() <= MAX {
        return ua.to_string();
    }
    format!("{}…", &ua[..MAX])
}

fn parse_user_agent(ua: &str) -> Option<String> {
    let lower = ua.to_ascii_lowercase();

    if lower.contains("postmanruntime") {
        return Some("Postman".into());
    }
    if lower.starts_with("curl/") || lower == "curl" {
        return Some("curl".into());
    }
    if lower.contains("okhttp") {
        return Some("OkHttp".into());
    }
    if lower.contains("java/") || lower.starts_with("java ") {
        return Some("java".into());
    }
    if lower.contains("apache-httpclient") {
        return Some("Apache HttpClient".into());
    }
    if lower.contains("go-http-client") {
        return Some("Go HTTP".into());
    }
    if lower.contains("python-requests") {
        return Some("Python requests".into());
    }
    if lower.contains("axios/") {
        return Some("axios".into());
    }
    if lower.contains("insomnia") {
        return Some("Insomnia".into());
    }
    if lower.contains("minimax") {
        return Some("MiniMax".into());
    }
    if lower.contains("wechat") || lower.contains("micromessenger") {
        return Some("WeChat".into());
    }
    if lower.contains("wxwork") || lower.contains("企业微信") {
        return Some("企业微信".into());
    }
    if lower.contains("cursor") {
        return Some("Cursor".into());
    }
    if lower.contains("trae") {
        return Some("Trae".into());
    }

    if lower.contains("edg/") || lower.contains(" edg/") {
        return Some("Microsoft Edge".into());
    }
    if lower.contains("chrome/") && !lower.contains("chromium") {
        return Some("Google Chrome".into());
    }
    if lower.contains("firefox/") {
        return Some("Firefox".into());
    }
    if lower.contains("safari/") && !lower.contains("chrome/") {
        return Some("Safari".into());
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn java_agent() {
        assert_eq!(client_label(Some("Java/17.0.2")), "java");
    }

    #[test]
    fn chrome_agent() {
        let ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        assert_eq!(client_label(Some(ua)), "Google Chrome");
    }

    #[test]
    fn no_user_agent() {
        assert_eq!(client_label(None), "无标识");
        assert_eq!(client_label(Some("")), "无标识");
        assert_eq!(client_label(Some("   ")), "无标识");
    }
}
