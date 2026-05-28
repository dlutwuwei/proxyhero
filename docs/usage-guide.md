[English](usage-guide.md) | [中文](usage-guide_zh.md)

# ProxyHero Usage Guide

ProxyHero is a local MITM proxy desktop app for API integration debugging. This guide covers day-to-day usage: capture, rewrite, certificates, and device debugging.

For implementation details, see [Architecture & Capture](architecture-and-capture.md).

## 1. Interface Overview

| Tab | Purpose |
|-----|---------|
| **Traffic** | Session list, filters, Inspector |
| **Map Rules** | Map Remote / Map Local rewrite rules |
| **SSL** | Control which HTTPS hosts are decrypted (MITM) |
| **Certificate** | Generate, install, and diagnose root CA |
| **Settings** | Port, language, system proxy, LAN guide |

The top bar shows proxy status and port. **Start Proxy** / **Stop Proxy** is available in Traffic and Settings.

## 2. Start & Stop Proxy

Click **Start Proxy** to:

1. Start the local MITM proxy service
2. Enable system proxy (pointing to `127.0.0.1:<port>`)

On **macOS**, enabling the proxy also clears the system’s intranet IP bypass list so traffic to `http://192.168.x.x` and similar addresses goes through the proxy. The original bypass list is restored when you stop the proxy or quit the app.

Click **Stop Proxy** to shut down the service and restore system proxy settings.

> Changing the proxy port in Settings takes effect after you restart the proxy.

## 3. Traffic

### Session list

- Virtual scrolling for large session counts
- Columns: client, method, status, time
- **↑ / ↓** arrow keys navigate sessions (when focus is not in an input field)

### Toolbar

- **Listen address**: Shows LAN IP and port when available (e.g. `192.168.1.5:8888`)
- **Clear All**: Remove all captured sessions
- **Search**: Filter by Host, URL, client, or User-Agent
- **Protocol**: All / HTTP / HTTPS
- **Status**: All / Active / 2xx / 4xx / 5xx

### Sidebar

- **Domains**: Group and filter by host
- **Clients**: Group by client identifier (from User-Agent, etc.)
- **Favorites**: Star (☆) or right-click a domain/client to favorite; use Favorites tab for quick access

### Inspector

Select a session to open the bottom Inspector. Left pane = request, right pane = response.

| Tab | Content |
|-----|---------|
| Headers | Request / response headers |
| Query | URL query parameters |
| Body | Decoded body text |
| Cookies | Cookie key-value pairs |
| Raw | Raw HTTP message |
| Summary / Tree | JSON summary or tree view (response) |

Other actions:

- **Copy cURL**: Reconstruct and copy the request as a cURL command
- **Rule**: Shows which Map rule matched (if any)

> Response bodies larger than 1 MB are truncated in the UI; the status bar shows the full size.

## 4. Map Rules

Rewrite traffic without changing the client app.

### Map Remote

Redirects matching requests to another upstream (e.g. staging API → local dev server).

| Field | Description |
|-------|-------------|
| Name | Rule label |
| Protocol | Match protocol (`http` / `https`) |
| Match Host | Host to match |
| Match Path | Path prefix; empty = all paths |
| Target protocol / host / port | Upstream destination |
| Preserve path / query | Keep original path and query string |

**Built-in presets** (one-click apply):

| Preset | Effect |
|--------|--------|
| Local API (8080) | `https://api.example.com` → `http://127.0.0.1:8080` |
| Local dev (3000) | `https://localhost` → `http://127.0.0.1:3000` |

Presets merge into your existing rules; they do not replace all rules.

### Map Local

Returns a local file as the HTTP response (mock / fixture).

| Field | Description |
|-------|-------------|
| Match Host / Path | Request to intercept |
| Local file | Absolute path to the response file |
| HTTP status | Response status code (default 200) |
| Headers | Optional response headers (e.g. `Content-Type`) |

### Rule priority

- Rules can be enabled/disabled individually
- Lower **order** value = higher priority
- Map Local is evaluated before Map Remote

## 5. SSL

Controls whether HTTPS is decrypted (MITM). Decryption requires a trusted **ProxyHero CA**.

| Mode | Behavior |
|------|----------|
| Default | MITM all HTTPS except **Exclude** list (tunnel only) |
| Include only | MITM only hosts in **Include** list |
| Default + Exclude | Same as Default; Exclude hosts are tunneled without decryption |

Hosts in **Exclude** are forwarded as encrypted tunnels — you will not see plaintext in Traffic.

## 6. Certificate

### Generate & install (local machine)

1. Open **Certificate**
2. Click **Generate** to create **ProxyHero CA**
3. Click **Install to System** (macOS adds to Keychain)
4. Check **Trust diagnostics**: proxy CA fingerprint should match keychain fingerprint
5. Restart the proxy and browser if you just installed or regenerated the CA

### Download URL (mobile / manual)

With the proxy running:

- Local: `http://127.0.0.1:<port>/proxyhero/ca.crt`
- LAN device: `http://<computer-ip>:<port>/proxyhero/ca.crt`

The Certificate page shows a QR code and step-by-step instructions when the proxy is active.

### Regenerate

**Regenerate** creates a new root CA. You must delete the old CA from the keychain, install the new one, and restart the proxy. Browsers will show certificate errors until the new CA is trusted.

## 7. Settings

| Option | Description |
|--------|-------------|
| Language | 中文 / English |
| Proxy port | Default `8888`; save and restart proxy to apply |
| Start / Stop Proxy | Same as Traffic toolbar |
| External devices | LAN IP and manual proxy setup hints |

### Browser without system proxy

```text
--proxy-server=127.0.0.1:8888 --proxy-bypass-list=""
```

## 8. Workflows

### Local machine debugging

1. **Certificate** → Generate → Install → confirm fingerprints match
2. **Traffic** or **Settings** → **Start Proxy**
3. Optional: **Map Rules** → apply a preset or add custom rules
4. Use browser or app; inspect sessions in **Traffic**
5. **Stop Proxy** when done (system proxy is restored automatically on quit)

### Mobile device capture

1. Phone and computer on the **same Wi-Fi**
2. **Settings** → note the computer’s LAN IP (e.g. `192.168.x.x`)
3. On the phone: Wi-Fi → HTTP proxy → Server = computer IP, Port = `8888`
4. On the phone browser: open `http://<computer-ip>:8888/proxyhero/ca.crt` and install the certificate
5. **iOS**: Settings → General → VPN & Device Management → install profile → Settings → General → About → Certificate Trust Settings → enable **ProxyHero CA**
6. **Android**: Settings → Security → install from storage → trust for VPN and apps
7. Use the target app on the phone; sessions appear in **Traffic** on the computer

## 9. Troubleshooting

| Symptom | What to try |
|---------|-------------|
| `NET::ERR_CERT_AUTHORITY_INVALID` | Remove old root CA from keychain (including legacy **LK Debug Proxy CA**) → regenerate & install in Certificate → restart proxy and browser |
| HTTPS not decrypted | Confirm CA is trusted; check SSL Exclude list; client may use certificate pinning |
| No traffic captured | Confirm proxy is started; on phone, check Wi-Fi proxy settings; only traffic sent through the proxy is captured |
| IP address URLs not proxied (macOS) | Use **Start Proxy** (clears intranet bypass); or set browser `--proxy-bypass-list=""` |
| Fingerprint mismatch | Reinstall CA; click **Refresh diagnostics** |
| Map rule not applied | Rule enabled? Host/path match? Check allowed map hosts in rules config |

## 10. Data & config files

App data directory (OS-specific, managed by Tauri):

| File | Content |
|------|---------|
| `config.json` | Port, system proxy state |
| `rules.json` | Map and SSL rules |
| `certs/proxyhero-ca.crt` | Root CA certificate and key |

## 11. Limitations

- HTTPS decryption requires trusting **ProxyHero CA**; apps with **certificate pinning** cannot be MITM’d
- Only traffic routed through the proxy is captured (server-side forwarding in dev tools does not pass through the browser proxy)
- HTTP/2 multiplexing associates request/response by FIFO on the same connection; rare mismatches under very high concurrency
- For local debugging only — not a replacement for production gateways or backend authentication
