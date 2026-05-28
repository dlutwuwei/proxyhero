import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openPath } from "@tauri-apps/plugin-opener";
import type {
  AppConfig,
  AppRules,
  CertInfo,
  CertDiagnostic,
  Preset,
  ProxyStatus,
  Session,
} from "../types";

export const api = {
  getProxyStatus: () => invoke<ProxyStatus>("get_proxy_status"),
  startProxy: () => invoke<ProxyStatus>("start_proxy"),
  stopProxy: () => invoke<ProxyStatus>("stop_proxy"),
  clearSessions: () => invoke<void>("clear_sessions"),
  clearSession: (sessionId: string) =>
    invoke<void>("clear_session", { sessionId }),
  listSessions: () => invoke<Session[]>("list_sessions"),
  getSession: (sessionId: string) =>
    invoke<Session | null>("get_session", { sessionId }),
  setCapturePaused: (paused: boolean) =>
    invoke<void>("set_capture_paused", { paused }),
  getRules: () => invoke<AppRules>("get_rules"),
  saveRules: (rules: AppRules) => invoke<void>("save_rules_cmd", { rules }),
  getConfig: () => invoke<AppConfig>("get_config"),
  saveConfig: (config: AppConfig) =>
    invoke<void>("save_config_cmd", { config }),
  getPresets: () => invoke<Preset[]>("get_presets"),
  applyPreset: (presetId: string) =>
    invoke<AppRules>("apply_preset", { presetId }),
  getCertInfo: () => invoke<CertInfo>("get_cert_info"),
  getCertDiagnostic: () => invoke<CertDiagnostic>("get_cert_diagnostic"),
  ensureCa: () => invoke<CertInfo>("ensure_ca"),
  installCa: () => invoke<string>("install_ca"),
  regenerateCa: () => invoke<CertInfo>("regenerate_ca"),
  openCertDir: async () => {
    const dir = await invoke<string>("open_cert_dir");
    await openPath(dir);
  },
  setSystemProxy: (enable: boolean) =>
    invoke<string>("set_system_proxy", { enable }),
  getDeviceProxyHint: () => invoke<string>("get_device_proxy_hint"),
  sessionToCurl: (sessionId: string) =>
    invoke<string>("session_to_curl", { sessionId }),
};

export function onSessionEvent(
  handler: (payload: {
    type: string;
    session: Session;
  }) => void,
) {
  return listen<{ type: string; session: Session }>("session:event", (e) => {
    handler(e.payload);
  });
}
