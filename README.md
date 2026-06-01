[English](README.md) | [中文](README_CN.md)

# ProxyHero

A local **MITM proxy desktop tool**, alternative to Proxyman / Charles. Supports HTTPS decryption, Map Remote/Local, SSL rules, root CA installation, and system proxy configuration, with built-in presets for common debugging scenarios.

![ProxyHero screenshot](capture.png)

## Why ProxyHero

Frontend and mobile app engineers often need to debug API calls during integration: inspect request/response payloads, point traffic to a local or staging backend, or capture HTTPS from a physical device. Generic proxies work, but team workflows need a focused desktop tool with Map rules, presets, and LAN capture out of the box.

ProxyHero is built for that — **local API integration debugging** for web and app developers, without relying on backend logs alone.

Paid tools like Charles or Proxyman pack a lot of features, but most day-to-day integration work only needs capture, rewrite, and device debugging. A **free, lightweight** tool is easier to adopt on the team — no license friction, no feature bloat, just open and debug.

## Features

| Module | Description |
|--------|-------------|
| **Traffic** | Session list (virtual scrolling), domain/client sidebar filtering, bottom Inspector, cURL copy |
| **Map Rules** | Map Remote (rewrite upstream), Map Local (local file response), built-in presets for one-click import |
| **SSL** | Include / Exclude to control MITM |
| **Certificate** | Generate/install root CA, keychain fingerprint and trust diagnostics |
| **Settings** | Proxy port, system proxy toggle, LAN debugging guide |

Proxy listens on **`0.0.0.0:8888`** by default, accessible from both local machine and same LAN devices.

## Tech Stack

- **UI**: React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand
- **Desktop Shell**: Tauri 2
- **Proxy Core**: Rust + [hudsucker](https://github.com/omjadas/hudsucker) (MITM)
- **Certificates**: rcgen for dynamic site certificates; IP access uses `SanType::IpAddress`

## Requirements

- **Node.js** 18+ (pnpm recommended)
- **Rust** 1.88+ (see `rust-toolchain.toml`)
- **macOS**: System proxy, root CA installation, and bypass list handling are fully adapted; Windows/Linux certificate and system proxy capabilities are as per current code

## Quick Start

```bash
cd proxyhero
pnpm install
pnpm tauri dev
```

Production build:

```bash
pnpm tauri build
```

### macOS installation (Release DMG)

Release builds are **not signed or notarized with an Apple Developer account**. After installing from a GitHub Release DMG, macOS may report the app as damaged — this is Gatekeeper blocking an unsigned app, not a corrupt download.

After dragging the app into **Applications**, run in Terminal:

```bash
xattr -cr /Applications/proxyhero.app
```

Then launch ProxyHero normally. Alternatively: right-click the app → **Open** → confirm (you may need to repeat after each update).

For a public release that opens without this step, an Apple Developer account is required for code signing and notarization.

Build frontend or Rust core only:

```bash
pnpm build
cargo build -p proxy-core
cargo test -p proxy-core
```

## Usage Guide (Debugging)

### Local Machine

1. Open **Traffic** or **Settings**, click "Start Proxy" (starts MITM service and enables system proxy simultaneously; macOS automatically removes internal IP bypasses).
2. **Certificate**: Generate and install root CA (**ProxyHero CA**), verify fingerprint matches on diagnostics page.
3. **Map Rules**: Apply built-in presets or custom rules as needed.
4. Visit target site in browser/app, return to **Traffic** to view plaintext requests and responses.

### Mobile Device Capture

1. Ensure phone and computer are on the same LAN.
2. In **Settings**, view computer's LAN IP address (e.g., `192.168.x.x`).
3. Configure proxy in phone's Wi-Fi settings: Server = computer IP, Port = `8888`.
4. In phone browser, visit `http://proxyhero/ca` or `http://{computerIP}:8888/ca` to download and install root certificate.
5. **iOS**: Settings → General → VPN & Device Management → Install Certificate → General → About → Certificate Trust Settings → Enable **ProxyHero CA**.
6. **Android**: Settings → Security → Install from storage → Select downloaded certificate → Set as "VPN and apps".
7. Access target app on phone, view requests in computer's **Traffic** page.

### Troubleshooting

If HTTPS shows `NET::ERR_CERT_AUTHORITY_INVALID`: Delete old root CA in keychain (including old **LK Debug Proxy CA**) → Regenerate and install in Certificate page → Restart proxy and browser.

## Project Structure

```text
proxyhero/                  # Source directory
├── src/                    # React frontend
├── src-tauri/              # Tauri commands, certificates, system proxy
└── crates/proxy-core/      # hudsucker proxy, capture, rule engine
```

Persistent directory (app data):

- `config.json` — Port, system proxy status, etc.
- `rules.json` — Map / SSL rules
- `certs/proxyhero-ca.crt` — Root CA and private key

## Architecture

- [Architecture & Capture (English)](docs/architecture-and-capture.md)

## Capture Support

| Type | Supported | Notes |
|------|-----------|-------|
| **HTTP** | ✅ | Plaintext request/response, headers, body |
| **HTTPS (MITM)** | ✅ | Requires trusted **ProxyHero CA** and domain matched by SSL Include / not excluded |
| **CONNECT tunnel** | ⚠️ | CONNECT session always logged; **SSL Exclude** or non-MITM hosts show metadata only (host, 200), no decrypted tunnel traffic |
| **WebSocket (`ws://`)** | ✅ | HTTP/1.1 `Upgrade` handshake + message frames |
| **WebSocket (`wss://`)** | ✅ | Same as above; requires MITM TLS decryption; MITM leg uses ALPN `http/1.1` |
| **HTTP/2 (regular HTTP)** | ✅ | Upstream may use HTTP/2; multiplexed streams paired via FIFO on same connection |
| **HTTP/2 WebSocket** | ❌ | RFC 8441 not supported (`:method=CONNECT` + `:protocol=websocket`) |
| **Certificate Pinning** | ❌ | Cannot MITM clients that verify certificate pins |
| **Non-proxied traffic** | ❌ | Only traffic routed through system/app proxy is captured |

## Limitations

- Must trust **ProxyHero CA** to decrypt HTTPS; Certificate Pinning clients cannot be MITM'd.
- **WSS** on SSL Exclude or non-MITM hosts shows CONNECT only; WebSocket messages are not captured.
- Only captures traffic forwarded through proxy; devServer server-side forwarding does not pass through browser proxy.
- HTTP/2 multiplexing associates requests/responses via FIFO on same connection; may mismatch under very high concurrency.
- This tool is for local debugging only, does not replace business gateway or backend authentication capabilities.
