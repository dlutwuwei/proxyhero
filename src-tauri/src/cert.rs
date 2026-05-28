use std::path::Path;
use std::process::Command;

use proxy_core::{CA_CERT_FILE, CA_COMMON_NAME, CA_KEY_FILE, PRODUCT_DISPLAY};
use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertInfo {
    pub exists: bool,
    pub path: String,
    pub fingerprint: Option<String>,
    pub installed_hint: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertDiagnostic {
    pub ca_fingerprint: Option<String>,
    pub keychain_fingerprint: Option<String>,
    pub fingerprints_match: bool,
    pub keychain_trusted: bool,
    pub hints: Vec<String>,
}

pub fn cert_fingerprint(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(hex::encode(Sha256::digest(&bytes)))
}

pub fn cert_info(cert_dir: &Path) -> CertInfo {
    let cert_path = cert_dir.join(CA_CERT_FILE);
    let exists = cert_path.exists();
    let fingerprint = if exists {
        cert_fingerprint(&cert_path)
    } else {
        None
    };
    CertInfo {
        exists,
        path: cert_path.display().to_string(),
        fingerprint,
        installed_hint: "安装根证书后须重启代理；访问 IP 的 HTTPS 需使用本工具签发的站点证书。".into(),
    }
}

#[cfg(target_os = "macos")]
fn keychain_ca_fingerprint() -> Option<String> {
    let output = Command::new("security")
        .args(["find-certificate", "-c", CA_COMMON_NAME, "-p"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let pem = &output.stdout;
    if pem.is_empty() {
        return None;
    }
    Some(hex::encode(Sha256::digest(pem)))
}

#[cfg(not(target_os = "macos"))]
fn keychain_ca_fingerprint() -> Option<String> {
    None
}

pub fn cert_diagnostic(cert_dir: &Path, proxy_running: bool) -> CertDiagnostic {
    let cert_path = cert_dir.join(CA_CERT_FILE);
    let ca_fingerprint = cert_fingerprint(&cert_path);
    let keychain_fingerprint = keychain_ca_fingerprint();

    let fingerprints_match = match (&ca_fingerprint, &keychain_fingerprint) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    };

    let mut hints = Vec::new();

    if !cert_path.exists() {
        hints.push("尚未生成 CA：请先启动代理或在 Certificate 页点击「生成证书」。".into());
    } else if let Ok(pem) = std::fs::read_to_string(&cert_path) {
        if pem.contains("750101") || pem.contains("40960101") {
            hints.push(
                "检测到旧版 CA（有效期 1975–4096，Chrome 易报 ERR_CERT_AUTHORITY_INVALID）。请点击「重新生成」→ 删除钥匙串旧 CA → 重新安装。".into(),
            );
        }
    }

    let has_keychain = keychain_fingerprint.is_some();

    if !has_keychain {
        hints.push(
            format!(
                "钥匙串中未找到「{CA_COMMON_NAME}」：请在本工具 Certificate 页点击「安装到系统」，并在钥匙串中设为「始终信任」。"
            ),
        );
    } else if !fingerprints_match {
        hints.push(
            format!(
                "钥匙串中的 CA 与当前 {PRODUCT_DISPLAY} 使用的 CA 不一致：请删除钥匙串里旧的根 CA（含旧版 LK Debug Proxy CA），重新安装并重启代理。"
            ),
        );
    }

    if proxy_running && (!fingerprints_match || !has_keychain) {
        hints.push("代理正在运行但 CA 未对齐：请停止代理 → 安装/信任证书 → 再启动代理。".into());
    }

    if fingerprints_match && proxy_running {
        hints.push(
            "CA 已对齐。若仍提示不安全：① 完全退出 Chrome 再打开 ② 确认访问的是 https 且非证书固定 ③ 用 IP 访问时需本次更新后的代理（已修复 IP 证书 SAN）。".into(),
        );
    }

    if hints.is_empty() && fingerprints_match {
        hints.push("CA 与钥匙串一致。若浏览器仍报错，请完全退出浏览器后重试。".into());
    }

    CertDiagnostic {
        ca_fingerprint,
        keychain_fingerprint,
        fingerprints_match,
        keychain_trusted: has_keychain,
        hints,
    }
}

#[cfg(target_os = "macos")]
fn remove_old_ca_from_keychain(keychain: &str) {
    for name in [CA_COMMON_NAME, "LK Debug Proxy CA"] {
        let _ = Command::new("security")
            .args(["delete-certificate", "-c", name, keychain])
            .output();
    }
}

#[cfg(target_os = "macos")]
pub fn install_ca(cert_path: &Path) -> Result<String, String> {
    let path = cert_path.to_string_lossy();
    let home = std::env::var("HOME").unwrap_or_default();
    let keychain = format!("{home}/Library/Keychains/login.keychain-db");

    remove_old_ca_from_keychain(&keychain);

    let output = Command::new("security")
        .args([
            "add-trusted-cert",
            "-d",
            "-r",
            "trustRoot",
            "-p",
            "ssl",
            "-p",
            "basic",
            "-k",
            &keychain,
            &path,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok("证书已安装（已标记 SSL 信任）。请停止并重新启动代理，完全退出 Chrome（Cmd+Q）后再打开。".into())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        if err.contains("already") || err.contains("SecItemAdd") {
            remove_old_ca_from_keychain(&keychain);
            let retry = Command::new("security")
                .args([
                    "add-trusted-cert",
                    "-d",
                    "-r",
                    "trustRoot",
                    "-p",
                    "ssl",
                    "-p",
                    "basic",
                    "-k",
                    &keychain,
                    &path,
                ])
                .output()
                .map_err(|e| e.to_string())?;
            if retry.status.success() {
                return Ok("证书已重新安装。请重启代理并退出 Chrome 后重试。".into());
            }
        }
        Err(format!(
            "{}\n也可手动：双击 .crt → 钥匙串访问 → 该证书 → 信任 → SSL：始终信任",
            err.trim()
        ))
    }
}

#[cfg(target_os = "windows")]
pub fn install_ca(cert_path: &Path) -> Result<String, String> {
    let path = cert_path.to_string_lossy();
    let output = Command::new("certutil")
        .args(["-user", "-addstore", "Root", &path])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok("证书已安装。请重启代理并重启浏览器。".into())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[cfg(target_os = "linux")]
pub fn install_ca(cert_path: &Path) -> Result<String, String> {
    let dest = format!("/usr/local/share/ca-certificates/{CA_CERT_FILE}");
    let output = Command::new("pkexec")
        .args([
            "sh",
            "-c",
            &format!(
                "cp '{}' '{}' && update-ca-certificates",
                cert_path.display(),
                dest
            ),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok("证书已安装。请重启代理并重启浏览器。".into())
    } else {
        Err(format!(
            "自动安装失败。请手动安装：{}",
            cert_path.display()
        ))
    }
}

pub fn regenerate_ca(cert_dir: &Path) -> Result<(), String> {
    let cert_path = cert_dir.join(CA_CERT_FILE);
    let key_path = cert_dir.join(CA_KEY_FILE);
    if cert_path.exists() {
        std::fs::remove_file(&cert_path).map_err(|e| e.to_string())?;
    }
    if key_path.exists() {
        std::fs::remove_file(&key_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
