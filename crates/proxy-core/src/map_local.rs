use std::collections::HashMap;
use std::path::Path;

pub fn has_header(headers: &HashMap<String, String>, name: &str) -> bool {
    let name = name.to_lowercase();
    headers.keys().any(|k| k.to_lowercase() == name)
}

pub fn header_value<'a>(headers: &'a HashMap<String, String>, name: &str) -> Option<&'a str> {
    let name = name.to_lowercase();
    headers
        .iter()
        .find(|(k, _)| k.to_lowercase() == name)
        .map(|(_, v)| v.as_str())
}

pub fn guess_content_type(local_file: &str, body: &[u8]) -> &'static str {
    if let Some(ext) = Path::new(local_file)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
    {
        let ct = match ext.as_str() {
            "json" => "application/json; charset=utf-8",
            "html" | "htm" => "text/html; charset=utf-8",
            "xml" => "application/xml; charset=utf-8",
            "txt" => "text/plain; charset=utf-8",
            "js" | "mjs" => "application/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "woff" => "font/woff",
            "woff2" => "font/woff2",
            "pdf" => "application/pdf",
            _ => "",
        };
        if !ct.is_empty() {
            return ct;
        }
    }

    let trimmed = body
        .iter()
        .position(|b| !b.is_ascii_whitespace())
        .map(|i| &body[i..])
        .unwrap_or(body);

    if trimmed.starts_with(b"{") || trimmed.starts_with(b"[") {
        if serde_json::from_slice::<serde_json::Value>(trimmed).is_ok() {
            return "application/json; charset=utf-8";
        }
    }
    if trimmed.starts_with(b"<!DOCTYPE") || trimmed.starts_with(b"<!doctype") {
        return "text/html; charset=utf-8";
    }
    if trimmed.starts_with(b"<?xml") {
        return "application/xml; charset=utf-8";
    }
    if trimmed.starts_with(b"<") {
        return "text/html; charset=utf-8";
    }
    if std::str::from_utf8(body).is_ok() {
        return "text/plain; charset=utf-8";
    }
    "application/octet-stream"
}

pub fn detect_response_headers(local_file: &str, body: &[u8]) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    headers.insert(
        "Content-Type".into(),
        guess_content_type(local_file, body).into(),
    );
    headers.insert("Content-Length".into(), body.len().to_string());
    headers
}

pub fn merge_response_headers(
    configured: &HashMap<String, String>,
    detected: HashMap<String, String>,
) -> HashMap<String, String> {
    let mut out = configured.clone();
    for (k, v) in detected {
        if !has_header(&out, &k) {
            out.insert(k, v);
        }
    }
    out
}

pub fn build_response_headers(
    configured: &HashMap<String, String>,
    auto_headers: bool,
    local_file: &str,
    body: &[u8],
) -> HashMap<String, String> {
    let mut out = if auto_headers {
        merge_response_headers(configured, detect_response_headers(local_file, body))
    } else if !has_header(configured, "content-type") {
        let mut configured = configured.clone();
        configured.insert(
            "Content-Type".into(),
            guess_content_type(local_file, body).into(),
        );
        configured
    } else {
        configured.clone()
    };
    if !has_header(&out, "content-length") {
        out.insert("Content-Length".into(), body.len().to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_json_from_extension_and_body() {
        assert_eq!(
            guess_content_type("/tmp/admin.json", b""),
            "application/json; charset=utf-8"
        );
        assert_eq!(
            guess_content_type("", br#"{"ok":true}"#),
            "application/json; charset=utf-8"
        );
    }

    #[test]
    fn merge_keeps_configured_headers() {
        let mut configured = HashMap::new();
        configured.insert("Content-Type".into(), "application/custom".into());
        let detected = detect_response_headers("", b"{}");
        let merged = merge_response_headers(&configured, detected);
        assert_eq!(
            header_value(&merged, "Content-Type"),
            Some("application/custom")
        );
        assert_eq!(header_value(&merged, "Content-Length"), Some("2"));
    }
}
