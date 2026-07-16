export interface HttpMessage {
  headers: [string, string][];
  body: string;
  bodyBase64?: string;
  isBinary: boolean;
  size: number;
  truncated?: boolean;
}

export interface WebSocketMessage {
  direction: "client" | "server";
  timestamp: string;
  opcode: string;
  payload: string;
  payloadBase64?: string;
  isBinary: boolean;
  size: number;
  truncated?: boolean;
}

export interface Session {
  id: string;
  startedAt: string;
  method: string;
  url: string;
  host: string;
  path: string;
  scheme: string;
  isHttps: boolean;
  status?: number;
  durationMs?: number;
  requestSize: number;
  responseSize?: number;
  request?: HttpMessage;
  response?: HttpMessage;
  mappedRuleId?: string;
  mappedRuleName?: string;
  mapType?: string;
  sslTunnel: boolean;
  completed: boolean;
  clientAddr?: string;
  userAgent?: string;
  clientName?: string;
  tlsPreset?: string;
  isWebSocket?: boolean;
  websocketMessages?: WebSocketMessage[];
}

export interface MapRemoteRule {
  id: string;
  enabled: boolean;
  name: string;
  order: number;
  matchRule: MatchRule;
  mapTo: MapToTarget;
}

export interface MapLocalRule {
  id: string;
  enabled: boolean;
  name: string;
  order: number;
  matchRule: MatchRule;
  localFile: string;
  localBody?: string;
  status: number;
  autoHeaders?: boolean;
  headers: Record<string, string>;
}

export interface MatchRule {
  protocol?: string;
  host: string;
  path?: string;
}

export interface MapToTarget {
  protocol: string;
  host: string;
  port: number;
  preservePath: boolean;
  preserveQuery: boolean;
  preserveHost?: boolean;
}

export type SslMode = "default" | "include" | "exclude";

export interface SslConfig {
  enabled?: boolean;
  mode: SslMode;
  includeHosts: string[];
  excludeHosts: string[];
}

export type TlsFingerprintMode = "default" | "auto" | "preset";
export type TlsPreset = "chrome" | "firefox";

export interface TlsFingerprintConfig {
  mode: TlsFingerprintMode;
  preset?: TlsPreset;
}

export interface AppRules {
  mapRemote: MapRemoteRule[];
  mapLocal: MapLocalRule[];
  ssl: SslConfig;
  allowedMapHosts: string[];
  tlsFingerprint?: TlsFingerprintConfig;
}

export type NotificationMessageType = "promo" | "tip" | "release";

export interface AppConfig {
  proxyPort: number;
  maxSessions: number;
  captureEnabled: boolean;
  systemProxyEnabled: boolean;
  notificationsEnabled: boolean;
  promotionalEnabled: boolean;
  lastCheckedAt?: string;
  seenMessageIds: string[];
  lastManifestVersion?: number;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  sessionCount: number;
  lanIp?: string;
}

export interface CertInfo {
  exists: boolean;
  path: string;
  fingerprint?: string;
  installedHint: string;
}

export interface CertDiagnostic {
  caFingerprint?: string;
  keychainFingerprint?: string;
  fingerprintsMatch: boolean;
  keychainTrusted: boolean;
  hints: string[];
}

export interface Preset {
  id: string;
  name: string;
  description: string;
}

export type NavPage = "traffic" | "rules" | "ssl" | "certificate" | "settings";
