# TLS 指纹伪造方案设计

> 场景：浏览器/App 经 ProxyHero 抓包时，上游因 TLS ClientHello 指纹（JA3/JA4）拦截请求

## 1. 目标

代理→上游的 TLS 连接使用与客户端浏览器匹配的 ClientHello 指纹，使 Cloudflare 等反爬系统认为代理连接来自真实浏览器。

## 2. 技术选型

### 2.1 依赖：specter（BoringSSL HTTP 客户端）

- 包名：`specters`（crates.io），lib 名：`specter`
- 用 BoringSSL 伪装 Chrome/Firefox 的 TLS + HTTP/2 指纹
- 预设：`FingerprintProfile::Chrome148`、`Firefox151` 等
- 集成方式：在 `handle_request` 中，指纹模式启用时用 specter 直接向上游发请求，绕过 hudsucker 默认 rustls 出站

```toml
# crates/proxy-core/Cargo.toml
specter = { package = "specters", version = "4" }
```

> custls / craftls 均已不可用或无法兼容 rustls 0.23，故改用 specter。

### 2.2 核心原理

hudsucker `ProxyBuilder` 提供 `with_http_connector<C: Connect>(connector: C)` 方法，可注入自定义 `hyper_rustls::HttpsConnector`。我们在构建 connector 时使用带指纹的 `ClientConfig` 替代默认的。

## 3. 数据模型

### 3.1 TlsFingerprintConfig（加入 AppRules）

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TlsFingerprintMode {
    Default,  // 不伪造，保持 rustls 默认行为
    Auto,     // 根据请求 User-Agent 自动选择预设
    Preset,   // 全局使用指定预设
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TlsPreset {
    Chrome,
    Firefox,
    Safari,
    Edge,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsFingerprintConfig {
    pub mode: TlsFingerprintMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset: Option<TlsPreset>,
}
```

### 3.2 Session 扩展

```rust
// Session 新增字段
pub tls_preset: Option<String>,  // 如 "chrome"、"firefox"、None（默认）
```

### 3.3 前端类型

```typescript
export type TlsFingerprintMode = "default" | "auto" | "preset";
export type TlsPreset = "chrome" | "firefox" | "safari" | "edge";

export interface TlsFingerprintConfig {
  mode: TlsFingerprintMode;
  preset?: TlsPreset;
}

// AppRules 新增
export interface AppRules {
  // ... 现有字段
  tlsFingerprint: TlsFingerprintConfig;
}
```

## 4. 核心实现

### 4.1 新增模块：`tls_fingerprint.rs`

职责：
- `ua_to_preset(ua: &str) -> Option<TlsPreset>` — 从 UA 推断浏览器类型
- `build_client_config(preset: Option<TlsPreset>) -> ClientConfig` — 构建带指纹的 ClientConfig
- `build_fingerprint_connector(config: &TlsFingerprintConfig) -> impl Connect` — 构建完整 connector

```rust
use hudsucker::rustls::ClientConfig;
use hudsucker::rustls::crypto::aws_lc_rs;

pub fn ua_to_preset(ua: &str) -> Option<TlsPreset> {
    let lower = ua.to_ascii_lowercase();
    if lower.contains("edg/") { return Some(TlsPreset::Edge); }
    if lower.contains("chrome/") { return Some(TlsPreset::Chrome); }
    if lower.contains("firefox/") { return Some(TlsPreset::Firefox); }
    if lower.contains("safari/") && !lower.contains("chrome/") { return Some(TlsPreset::Safari); }
    None
}

pub fn build_client_config(preset: Option<TlsPreset>) -> ClientConfig {
    let provider = aws_lc_rs::default_provider();
    let root_store = webpki_roots::TLS_SERVER_ROOTS.into();

    match preset {
        None => {
            // 默认行为，与现有代码一致
            ClientConfig::builder_with_provider(Arc::new(provider))
                .with_safe_default_protocol_versions().unwrap()
                .with_root_certificates(root_store)
                .with_no_client_auth()
        }
        Some(TlsPreset::Chrome) => {
            ClientConfig::builder()
                .with_root_certificates(root_store)
                .with_no_client_auth()
                .with_fingerprint(custls::craft::CHROME_130.builder().do_not_override_alpn())
        }
        // Firefox, Safari, Edge 类似
    }
}
```

### 4.2 修改 `server.rs`

替换 `with_rustls_connector` 为 `with_http_connector`：

```rust
// 之前
.with_rustls_connector(aws_lc_rs::default_provider())

// 之后
fn build_connector(fingerprint_config: &TlsFingerprintConfig) -> impl Connect + Clone {
    let preset = match fingerprint_config.mode {
        TlsFingerprintMode::Default => None,
        TlsFingerprintMode::Preset => fingerprint_config.preset.clone(),
        TlsFingerprintMode::Auto => {
            // Auto 模式下需要按请求动态选择，见 4.4
            None  // fallback，实际在 handler 层处理
        }
    };
    let config = build_client_config(preset);
    let https = hyper_rustls::HttpsConnectorBuilder::new()
        .with_tls_config(config)
        .https_or_http()
        .enable_http1();
    #[cfg(feature = "http2")]
    let https = https.enable_http2();
    https.build()
}

// server.rs start()
let connector = build_connector(&state.tls_fingerprint.read().await);
let proxy = Proxy::builder()
    .with_addr(addr)
    .with_ca(ca)
    .with_http_connector(connector)
    .with_http_handler(handler)
    .with_graceful_shutdown(...)
    .build()?;
```

### 4.3 Auto 模式的挑战与解法

**问题**：hudsucker 在启动时构建一个全局 connector，所有请求共用同一个 `ClientConfig`。但 Auto 模式需要按请求的 UA 动态切换指纹。

**解法**：为每种预设各构建一个 connector，在 `CaptureHandler` 中根据 UA 选择：

```rust
// SharedState 新增
pub tls_connectors: Arc<TlsConnectorPool>,

pub struct TlsConnectorPool {
    pub default: HttpsConnector<HttpConnector>,
    pub chrome: HttpsConnector<HttpConnector>,
    pub firefox: HttpsConnector<HttpConnector>,
    pub safari: HttpsConnector<HttpConnector>,
    pub edge: HttpsConnector<HttpConnector>,
}
```

但 hudsucker 的 HTTP handler 无法控制出站连接使用哪个 connector（connector 在 Proxy 构建时固定）。

**实际可行方案**：Auto 模式下，代理启动时构建 **Chrome 指纹的 connector**（Chrome 覆盖率最高），对 Firefox/Safari 请求也是 Chrome 指纹。这已足够应对绝大多数反爬场景，因为：

1. Chrome 市占率最高，Cloudflare 对 Chrome 指纹放行率最高
2. 绝大多数浏览器的 TLS 指纹差异对反爬的影响远小于「rustls 默认指纹 vs 任何浏览器指纹」
3. 如需精确匹配，用户可手动切 Preset 模式

**后续优化**（Phase 2）：fork hudsucker 支持按请求动态选择 connector，或为每种指纹启动独立代理端口。

### 4.4 简化方案（推荐实施）

启动时根据 `TlsFingerprintConfig.mode` 选择一个全局 connector：

| mode | connector |
|------|-----------|
| Default | rustls 默认（现有行为） |
| Auto | Chrome 预设（覆盖率最高） |
| Preset: Chrome | Chrome 预设 |
| Preset: Firefox | Firefox 预设 |
| Preset: Safari | Safari 预设 |
| Preset: Edge | Edge 预设 |

Session 中记录实际使用的 `tls_preset`，便于诊断。

## 5. 文件改动清单

### 5.1 proxy-core（Rust）

| 文件 | 操作 | 改动 |
|------|------|------|
| `Cargo.toml` | 修改 | 添加 `webpki-roots` 依赖；条件编译 custls |
| `src/lib.rs` | 修改 | 新增 `pub mod tls_fingerprint;` |
| `src/tls_fingerprint.rs` | 新建 | TlsFingerprintConfig/Mode/Preset 枚举、build_client_config、build_connector |
| `src/rules.rs` | 修改 | AppRules 新增 `tls_fingerprint: TlsFingerprintConfig` 字段 |
| `src/server.rs` | 修改 | start() 使用 with_http_connector 替代 with_rustls_connector |
| `src/state.rs` | 修改 | SharedState 新增 tls_fingerprint 字段（或直接从 rules 读） |
| `src/handler.rs` | 修改 | handle_request 中记录 tls_preset 到 session |
| `src/session.rs` | 修改 | Session 新增 tls_preset 字段 |

### 5.2 工作区根

| 文件 | 操作 | 改动 |
|------|------|------|
| `Cargo.toml` | 修改 | 添加 `[patch.crates-io] rustls = ...` |

### 5.3 前端

| 文件 | 操作 | 改动 |
|------|------|------|
| `src/types.ts` | 修改 | 新增 TlsFingerprintMode/TlsPreset/TlsFingerprintConfig 类型；AppRules 添加 tlsFingerprint |
| `src/views/SettingsView.tsx` | 修改 | 新增 TLS 指纹配置区块（模式下拉 + 预设选择） |
| `src/i18n/messages.ts` | 修改 | 新增翻译 key |

### 5.4 Tauri 壳

| 文件 | 操作 | 改动 |
|------|------|------|
| `src-tauri/Cargo.toml` | 修改 | 条件编译 feature flag |
| `src-tauri/src/commands.rs` | 无改动 | 规则通过现有 save_rules_cmd 保存，无需新 command |

## 6. 向后兼容

- `TlsFingerprintConfig::default()` → `{ mode: Default, preset: None }`
- 现有 `rules.json` 无 `tlsFingerprint` 字段时，serde `#[serde(default)]` 自动填充
- `mode: Default` 时行为与现版完全一致
- `[patch.crates-io]` 仅替换 rustls，custls 作为 drop-in replacement 不影响现有 API

## 7. 验证方法

1. 启动代理，mode=Default，访问 `https://tls.browserleaks.com/json` → 记录 JA3
2. 切换 mode=Preset:Chrome，重启代理，再次访问 → JA3 应与 Chrome 浏览器一致
3. 之前被 Cloudflare 403 的 API，切换后应 200
4. mode=Default 时，所有现有功能不受影响

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| custls 与 rustls 0.23.40 API 不兼容 | 编译期发现；备选 craftls；最坏情况自行在 rustls 上 patch ClientHello 编码 |
| hudsucker 内部使用的 rustls 类型与 custls 版本冲突 | [patch.crates-io] 全局替换确保一致 |
| 指纹预设过时 | custls 社区更新；可在 UI 中提示当前预设对应的浏览器版本 |
| 修改 UA 不匹配 TLS 指纹仍被拦 | Auto 模式默认 Chrome（最高兼容）；UI 说明需 UA 与指纹一致 |
