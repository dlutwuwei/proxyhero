use crate::session::{HttpMessage, Session};

fn shell_single_quoted(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn skip_request_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "host"
            | "connection"
            | "keep-alive"
            | "proxy-connection"
            | "transfer-encoding"
            | "upgrade"
            | "content-length"
            | "te"
            | "trailer"
    )
}

fn request_body_for_curl(req: &HttpMessage) -> Option<String> {
    if !req.is_binary {
        return (!req.body.is_empty()).then(|| req.body.clone());
    }
    let b64 = req.body_base64.as_ref()?;
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .ok()?;
    String::from_utf8(bytes).ok().filter(|s| !s.is_empty())
}

pub fn format_session_curl(session: &Session) -> String {
    if session.method.eq_ignore_ascii_case("CONNECT") {
        let target = format!("{}://{}/", session.scheme, session.host);
        let mut lines = vec![
            "# HTTPS proxy tunnel (CONNECT)".to_string(),
            format!("curl -x <proxy-host>:<port> {}", shell_single_quoted(&target)),
        ];
        if let Some(req) = &session.request {
            for (k, v) in &req.headers {
                if skip_request_header(k) {
                    continue;
                }
                lines.push(format!(
                    "  -H {}",
                    shell_single_quoted(&format!("{k}: {v}"))
                ));
            }
        }
        return lines.join(" \\\n");
    }

    let mut lines = vec![format!(
        "curl -X {} {}",
        session.method,
        shell_single_quoted(&session.url)
    )];

    if let Some(req) = &session.request {
        for (k, v) in &req.headers {
            if skip_request_header(k) {
                continue;
            }
            lines.push(format!(
                "  -H {}",
                shell_single_quoted(&format!("{k}: {v}"))
            ));
        }
        if let Some(body) = request_body_for_curl(req) {
            lines.push(format!("  --data-raw {}", shell_single_quoted(&body)));
        }
    }

    lines.join(" \\\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_get() {
        let session = Session::new(
            "id".into(),
            "GET".into(),
            "https://example.com/api".into(),
            "example.com".into(),
            "/api".into(),
            "https".into(),
        );
        let curl = format_session_curl(&session);
        assert!(curl.contains("curl -X GET"));
        assert!(curl.contains("https://example.com/api"));
    }

    #[test]
    fn connect_tunnel_curl() {
        let session = Session::new(
            "id".into(),
            "CONNECT".into(),
            "https://api2.cursor.sh:443".into(),
            "api2.cursor.sh".into(),
            "/".into(),
            "https".into(),
        );
        let curl = format_session_curl(&session);
        assert!(curl.contains("HTTPS proxy tunnel"));
        assert!(curl.contains("curl -x <proxy-host>:<port>"));
        assert!(curl.contains("https://api2.cursor.sh/"));
        assert!(!curl.contains("-X CONNECT"));
    }
}
