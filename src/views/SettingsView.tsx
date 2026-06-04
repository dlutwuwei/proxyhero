import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { api } from "../api/tauri";
import { ProxyToggleButton, useProxyEnabled } from "../components/ProxyControl";
import { useT } from "../hooks/useT";
import { useUpdater } from "../hooks/useUpdater";
import { ensureNotificationPermission } from "../lib/notificationPermission";
import { useAppStore } from "../stores/appStore";
import { useLocaleStore } from "../stores/localeStore";
import { useTrafficStore } from "../stores/trafficStore";
import type { Locale } from "../i18n/messages";
import type { AppConfig, TlsFingerprintMode, TlsPreset } from "../types";

const CURRENT_VERSION = "0.1.0";

const CARD =
  "min-w-0 rounded border border-[#333] bg-[#252526] p-4";

function SettingsCard({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={`${CARD} ${className}`.trim()}>{children}</section>;
}

export function SettingsView() {
  const t = useT();
  const config = useAppStore((s) => s.config);
  const rules = useAppStore((s) => s.rules);
  const loadConfig = useAppStore((s) => s.loadConfig);
  const loadRules = useAppStore((s) => s.loadRules);
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const setMessage = useAppStore((s) => s.setMessage);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [hint, setHint] = useState("");
  const [port, setPort] = useState(8888);
  const { 
    checking, 
    updateAvailable, 
    updateInfo, 
    downloading, 
    downloadProgress, 
    checkForUpdates, 
    installUpdate 
  } = useUpdater();
  const saveNotificationPrefs = async (
    patch: Partial<Pick<AppConfig, "notificationsEnabled" | "promotionalEnabled">>,
  ) => {
    const next = { ...config!, ...patch };
    if (patch.notificationsEnabled) {
      await ensureNotificationPermission();
    }
    await api.saveConfig(next);
    await loadConfig();
  };

  useEffect(() => {
    if (config) setPort(config.proxyPort);
    api.getDeviceProxyHint().then(setHint);
  }, [config]);

  if (!config || !rules) return null;

  const tls = rules.tlsFingerprint ?? { mode: "default" as TlsFingerprintMode };

  const saveTlsFingerprint = async (
    mode: TlsFingerprintMode,
    preset?: TlsPreset,
  ) => {
    const next = {
      ...rules,
      tlsFingerprint: {
        mode,
        preset: mode === "preset" ? preset ?? "chrome" : undefined,
      },
    };
    await api.saveRules(next);
    await loadRules();
    setMessage(t("settings.tlsFingerprint.saved"));
    setTimeout(() => setMessage(null), 2500);
  };

  const savePort = async () => {
    const next = { ...config, proxyPort: port };
    await api.saveConfig(next);
    await loadConfig();
    await refreshStatus();
    setMessage(t("settings.portSaved"));
    setTimeout(() => setMessage(null), 2000);
  };

  const proxyEnabled = useProxyEnabled();
  const showConnectRequests = useTrafficStore((s) => s.showConnectRequests);
  const setShowConnectRequests = useTrafficStore((s) => s.setShowConnectRequests);

  return (
    <div className="overflow-auto p-4 md:p-6">
      <h2 className="mb-4 text-lg font-medium">{t("settings.title")}</h2>

      <div className="grid auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SettingsCard>
          <h3 className="mb-3 text-sm font-medium">{t("settings.language")}</h3>
          <select
            className="w-full max-w-xs rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5 text-sm"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="zh">{t("settings.languageZh")}</option>
            <option value="en">{t("settings.languageEn")}</option>
          </select>
        </SettingsCard>

        <SettingsCard>
          <h3 className="mb-3 text-sm font-medium">{t("settings.proxyPort")}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              className="w-full min-w-[6rem] max-w-[8rem] flex-1 rounded border border-[#444] bg-[#1e1e1e] px-2 py-1 text-sm"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
            <button
              type="button"
              onClick={() => savePort()}
              className="shrink-0 rounded bg-[#333] px-3 py-1 text-sm hover:bg-[#444]"
            >
              {t("common.save")}
            </button>
          </div>
        </SettingsCard>

        <SettingsCard>
          <h3 className="mb-3 text-sm font-medium">{t("settings.proxy")}</h3>
          <p className="mb-3 text-xs text-[#888]">
            {t("settings.proxyDesc")}
            {proxyEnabled ? t("proxy.enabled") : t("proxy.disabled")}
          </p>
          <p className="mb-3 text-xs text-amber-200/90">{t("settings.proxyIpHint")}</p>
          <ProxyToggleButton size="md" />
        </SettingsCard>

        <SettingsCard className="sm:col-span-2 xl:col-span-1">
          <h3 className="mb-1 text-sm font-medium">{t("settings.tlsFingerprint")}</h3>
          <p className="mb-3 text-xs text-[#888]">{t("settings.tlsFingerprintDesc")}</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {(
              [
                ["default", "settings.tlsFingerprint.mode.default"],
                ["auto", "settings.tlsFingerprint.mode.auto"],
                ["preset", "settings.tlsFingerprint.mode.preset"],
              ] as const
            ).map(([mode, labelKey]) => (
              <button
                key={mode}
                type="button"
                onClick={() => saveTlsFingerprint(mode, tls.preset)}
                className={`rounded px-3 py-1.5 text-sm ${
                  tls.mode === mode ? "bg-[#094771]" : "bg-[#333]"
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          {tls.mode === "preset" && (
            <div>
              <label className="mb-1 block text-xs text-[#888]">
                {t("settings.tlsFingerprint.preset")}
              </label>
              <select
                className="w-full max-w-xs rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5 text-sm"
                value={tls.preset ?? "chrome"}
                onChange={(e) =>
                  saveTlsFingerprint("preset", e.target.value as TlsPreset)
                }
              >
                <option value="chrome">{t("settings.tlsFingerprint.preset.chrome")}</option>
                <option value="firefox">{t("settings.tlsFingerprint.preset.firefox")}</option>
              </select>
            </div>
          )}
        </SettingsCard>

        <SettingsCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 text-sm font-medium">{t("settings.showConnectRequests")}</h3>
              <p className="text-xs text-[#888]">{t("settings.showConnectRequestsDesc")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showConnectRequests}
              onClick={() => setShowConnectRequests(!showConnectRequests)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${showConnectRequests ? "bg-blue-500" : "bg-[#444]"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${showConnectRequests ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
        </SettingsCard>

        <SettingsCard className="sm:col-span-2">
          <h3 className="mb-3 text-sm font-medium">{t("notifications.title")}</h3>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{t("notifications.enable")}</p>
                <p className="text-xs text-[#888]">{t("notifications.enableDesc")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.notificationsEnabled !== false}
                onClick={() =>
                  saveNotificationPrefs({
                    notificationsEnabled: config.notificationsEnabled === false,
                  })
                }
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${config.notificationsEnabled !== false ? "bg-blue-500" : "bg-[#444]"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config.notificationsEnabled !== false ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{t("notifications.promotional")}</p>
                <p className="text-xs text-[#888]">{t("notifications.promotionalDesc")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.promotionalEnabled !== false}
                disabled={config.notificationsEnabled === false}
                onClick={() =>
                  saveNotificationPrefs({
                    promotionalEnabled: config.promotionalEnabled === false,
                  })
                }
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${config.promotionalEnabled !== false ? "bg-blue-500" : "bg-[#444]"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config.promotionalEnabled !== false ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
            <p className="text-xs text-[#888]">
              {t("notifications.lastChecked")}:{" "}
              {config.lastCheckedAt
                ? new Date(config.lastCheckedAt).toLocaleString()
                : t("notifications.never")}
            </p>
          </div>
        </SettingsCard>

        <SettingsCard className="col-span-full sm:col-span-2 xl:col-span-2">
          <h3 className="mb-3 text-sm font-medium">{t("updates.title")}</h3>
          <p className="mb-3 text-xs text-[#888]">
            {t("updates.currentVersion")}: {CURRENT_VERSION}
          </p>

          {updateAvailable && updateInfo && (
            <div className="mb-3 rounded border border-blue-500/30 bg-blue-500/10 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-blue-400">
                  {t("updates.updateAvailable")}
                </span>
                <span className="mono text-xs text-blue-300">
                  {t("updates.version")}: {updateInfo.version}
                </span>
              </div>
              {updateInfo.body && (
                <div className="mb-3">
                  <p className="mb-1 text-xs text-[#888]">{t("updates.releaseNotes")}:</p>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-[#aaa]">
                    {updateInfo.body}
                  </pre>
                </div>
              )}
              <button
                type="button"
                onClick={installUpdate}
                disabled={downloading}
                className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading ? `${t("updates.downloading")} ${downloadProgress}%` : t("updates.install")}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={checkForUpdates}
            disabled={checking || downloading}
            className="w-full max-w-sm rounded bg-[#333] px-3 py-2 text-sm hover:bg-[#444] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? t("updates.checking") : t("updates.check")}
          </button>
        </SettingsCard>

        <SettingsCard className="col-span-full">
          <h3 className="mb-3 text-sm font-medium">{t("settings.externalDevices")}</h3>
          <pre className="mono overflow-x-auto whitespace-pre-wrap text-xs text-[#aaa]">{hint}</pre>
        </SettingsCard>
      </div>
    </div>
  );
}
