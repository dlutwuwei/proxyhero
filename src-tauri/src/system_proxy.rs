use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

/// 占位：不匹配真实业务 IP/域名，用于替换系统默认的「内网 IP 绕过」列表
const NO_BYPASS_PLACEHOLDER: &str = "_proxyhero_";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct BypassBackup {
    #[serde(default)]
    macos_services: Vec<MacBypassEntry>,
    #[serde(default)]
    windows_override: Option<String>,
    #[serde(default)]
    linux_ignore_hosts: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MacBypassEntry {
    service: String,
    domains: Vec<String>,
}

fn backup_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("proxy_bypass_backup.json")
}

pub fn has_proxy_backup(data_dir: &Path) -> bool {
    backup_path(data_dir).is_file()
}

fn load_backup(data_dir: &Path) -> Option<BypassBackup> {
    let content = std::fs::read_to_string(backup_path(data_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_backup(data_dir: &Path, backup: &BypassBackup) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(backup).map_err(|e| e.to_string())?;
    std::fs::write(backup_path(data_dir), json).map_err(|e| e.to_string())
}

fn remove_backup(data_dir: &Path) {
    let _ = std::fs::remove_file(backup_path(data_dir));
}

/// 启用系统代理时清除「绕过列表」中的内网 IP 段，否则 http://192.168.x.x 等不会走代理
pub fn set_system_proxy(
    data_dir: &Path,
    host: &str,
    port: u16,
    enable: bool,
) -> Result<String, String> {
    if enable {
        clear_intranet_bypass(data_dir)?;
        set_proxy_impl(host, port)
    } else {
        let msg = clear_proxy_impl()?;
        restore_intranet_bypass(data_dir)?;
        Ok(msg)
    }
}

fn clear_intranet_bypass(data_dir: &Path) -> Result<(), String> {
    let mut backup = BypassBackup::default();

    #[cfg(target_os = "macos")]
    {
        for service in list_network_services()? {
            let domains = get_bypass_domains(&service)?;
            if !domains.is_empty() {
                backup.macos_services.push(MacBypassEntry {
                    service: service.clone(),
                    domains,
                });
            }
            set_bypass_domains(&service, &[NO_BYPASS_PLACEHOLDER.to_string()])?;
        }
    }

    #[cfg(target_os = "windows")]
    {
        backup.windows_override = Some(get_windows_proxy_override()?);
        set_windows_proxy_override("")?;
    }

    #[cfg(target_os = "linux")]
    {
        backup.linux_ignore_hosts = get_linux_ignore_hosts().ok();
        set_linux_ignore_hosts("[]")?;
    }

    save_backup(data_dir, &backup)
}

fn restore_intranet_bypass(data_dir: &Path) -> Result<(), String> {
    let Some(backup) = load_backup(data_dir) else {
        return Ok(());
    };

    #[cfg(target_os = "macos")]
    {
        for entry in &backup.macos_services {
            if entry.domains.is_empty() {
                set_bypass_domains(
                    &entry.service,
                    &[
                        "127.0.0.1".into(),
                        "localhost".into(),
                        "192.168.0.0/16".into(),
                        "10.0.0.0/8".into(),
                        "172.16.0.0/12".into(),
                        "*.local".into(),
                    ],
                )?;
            } else {
                set_bypass_domains(&entry.service, &entry.domains)?;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let v = backup
            .windows_override
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "<local>".into());
        set_windows_proxy_override(&v)?;
    }

    #[cfg(target_os = "linux")]
    {
        let v = backup.linux_ignore_hosts.unwrap_or_else(|| {
            "['localhost', '127.0.0.0/8', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']"
                .into()
        });
        set_linux_ignore_hosts(&v)?;
    }

    remove_backup(data_dir);
    Ok(())
}

#[cfg(target_os = "macos")]
fn get_bypass_domains(service: &str) -> Result<Vec<String>, String> {
    let output = Command::new("networksetup")
        .args(["-getproxybypassdomains", service])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(vec![]);
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty() && !l.starts_with('*'))
        .collect())
}

#[cfg(target_os = "macos")]
fn set_bypass_domains(service: &str, domains: &[String]) -> Result<(), String> {
    let mut cmd = Command::new("networksetup");
    cmd.arg("-setproxybypassdomains").arg(service);
    for d in domains {
        cmd.arg(d);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[cfg(target_os = "macos")]
fn set_proxy_impl(host: &str, port: u16) -> Result<String, String> {
    for service in list_network_services()? {
        let _ = Command::new("networksetup")
            .args(["-setwebproxy", &service, host, &port.to_string()])
            .output();
        let _ = Command::new("networksetup")
            .args(["-setsecurewebproxy", &service, host, &port.to_string()])
            .output();
        let _ = Command::new("networksetup")
            .args(["-setwebproxystate", &service, "on"])
            .output();
        let _ = Command::new("networksetup")
            .args(["-setsecurewebproxystate", &service, "on"])
            .output();
    }
    Ok(format!(
        "系统代理已设为 {host}:{port}（已取消内网 IP 段绕过，可抓取 IP 访问）"
    ))
}

#[cfg(target_os = "macos")]
fn clear_proxy_impl() -> Result<String, String> {
    for service in list_network_services()? {
        let _ = Command::new("networksetup")
            .args(["-setwebproxystate", &service, "off"])
            .output();
        let _ = Command::new("networksetup")
            .args(["-setsecurewebproxystate", &service, "off"])
            .output();
    }
    Ok("系统代理已关闭".into())
}

#[cfg(target_os = "macos")]
fn list_network_services() -> Result<Vec<String>, String> {
    let output = Command::new("networksetup")
        .arg("-listallnetworkservices")
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .skip(1)
        .filter(|l| !l.trim().is_empty() && !l.starts_with('*'))
        .map(|s| s.to_string())
        .collect())
}

#[cfg(target_os = "windows")]
fn get_windows_proxy_override() -> Result<String, String> {
    let ps = "(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings').ProxyOverride";
    let output = Command::new("powershell")
        .args(["-Command", ps])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn set_windows_proxy_override(value: &str) -> Result<(), String> {
    let escaped = value.replace('\'', "''");
    let ps = format!(
        "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyOverride -Value '{}'",
        escaped
    );
    let output = Command::new("powershell")
        .args(["-Command", &ps])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[cfg(target_os = "windows")]
fn set_proxy_impl(host: &str, port: u16) -> Result<String, String> {
    let proxy = format!("{host}:{port}");
    let ps = format!(
        "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 1; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyServer -Value '{}'",
        proxy
    );
    let output = Command::new("powershell")
        .args(["-Command", &ps])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(format!(
            "系统代理已设为 {proxy}（已清空调试绕过，可抓取 IP 访问）"
        ))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[cfg(target_os = "windows")]
fn clear_proxy_impl() -> Result<String, String> {
    let ps = "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 0";
    let output = Command::new("powershell")
        .args(["-Command", ps])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok("系统代理已关闭".into())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[cfg(target_os = "linux")]
fn get_linux_ignore_hosts() -> Result<String, String> {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.system.proxy", "ignore-hosts"])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "linux")]
fn set_linux_ignore_hosts(value: &str) -> Result<(), String> {
    let output = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy", "ignore-hosts", value])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[cfg(target_os = "linux")]
fn set_proxy_impl(host: &str, port: u16) -> Result<String, String> {
    if Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy", "mode", "manual"])
        .output()
        .is_err()
    {
        return Ok(format!(
            "请手动设置代理 {host}:{port}，并删除 ignore-hosts 中的内网 IP 段"
        ));
    }
    for schema in [
        "org.gnome.system.proxy.http",
        "org.gnome.system.proxy.https",
    ] {
        let _ = Command::new("gsettings")
            .args(["set", schema, "host", host])
            .output();
        let _ = Command::new("gsettings")
            .args(["set", schema, "port", &port.to_string()])
            .output();
    }
    Ok(format!("GNOME 代理已设为 {host}:{port}"))
}

#[cfg(target_os = "linux")]
fn clear_proxy_impl() -> Result<String, String> {
    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy", "mode", "none"])
        .output();
    Ok("系统代理已关闭".into())
}

pub fn manual_proxy_hint(host: &str, port: u16) -> String {
    format!(
        "HTTP/HTTPS 代理：{host}:{port}\n\
         访问 IP 地址（如 http://192.168.x.x）须在 Settings 启用系统代理，\
         本工具会取消系统对 10/172/192 内网段的代理绕过。\n\
         也可手动：--proxy-server={host}:{port} --proxy-bypass-list=\"\"\n\
         真机 Wi-Fi 代理填本机局域网 IP + 端口 {port}（代理监听 0.0.0.0）。"
    )
}

pub fn get_lan_ip() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        for iface in ["en0", "en1", "en2"] {
            let output = Command::new("ipconfig")
                .arg("getifaddr")
                .arg(iface)
                .output()
                .ok()?;
            let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !ip.is_empty() && ip != "127.0.0.1" {
                return Some(ip);
            }
        }
        None
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}
