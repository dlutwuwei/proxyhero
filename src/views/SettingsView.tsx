import { useEffect, useState } from "react";
import { api } from "../api/tauri";
import { ProxyToggleButton, useProxyEnabled } from "../components/ProxyControl";
import { useT } from "../hooks/useT";
import { useUpdater } from "../hooks/useUpdater";
import { useAppStore } from "../stores/appStore";
import { useLocaleStore } from "../stores/localeStore";
import { useTrafficStore } from "../stores/trafficStore";
import type { Locale } from "../i18n/messages";

const CURRENT_VERSION = "0.1.0";

export function SettingsView() {
  const t = useT();
  const config = useAppStore((s) => s.config);
  const loadConfig = useAppStore((s) => s.loadConfig);
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

  useEffect(() => {
    if (config) setPort(config.proxyPort);
    api.getDeviceProxyHint().then(setHint);
  }, [config]);

  if (!config) return null;

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
    <div className="overflow-auto p-4">
      <h2 className="mb-4 text-lg font-medium">{t("settings.title")}</h2>

      <section className="mb-6 max-w-lg rounded border border-[#333] bg-[#252526] p-4">
        <h3 className="mb-3 text-sm font-medium">{t("settings.language")}</h3>
        <select
          className="rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5 text-sm"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          <option value="zh">{t("settings.languageZh")}</option>
          <option value="en">{t("settings.languageEn")}</option>
        </select>
      </section>

      <section className="mb-6 max-w-lg rounded border border-[#333] bg-[#252526] p-4">
        <h3 className="mb-3 text-sm font-medium">{t("settings.proxyPort")}</h3>
        <div className="flex gap-2">
          <input
            type="number"
            className="w-32 rounded border border-[#444] bg-[#1e1e1e] px-2 py-1 text-sm"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <button
            type="button"
            onClick={() => savePort()}
            className="rounded bg-[#333] px-3 py-1 text-sm hover:bg-[#444]"
          >
            {t("common.save")}
          </button>
        </div>
      </section>

      <section className="mb-6 max-w-lg rounded border border-[#333] bg-[#252526] p-4">
        <h3 className="mb-3 text-sm font-medium">{t("settings.proxy")}</h3>
        <p className="mb-3 text-xs text-[#888]">
          {t("settings.proxyDesc")}
          {proxyEnabled ? t("proxy.enabled") : t("proxy.disabled")}
        </p>
        <p className="mb-3 text-xs text-amber-200/90">{t("settings.proxyIpHint")}</p>
        <ProxyToggleButton size="md" />
      </section>

      <section className="mb-6 max-w-lg rounded border border-[#333] bg-[#252526] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="mb-1 text-sm font-medium">{t("settings.showConnectRequests")}</h3>
            <p className="text-xs text-[#888]">{t("settings.showConnectRequestsDesc")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showConnectRequests}
            onClick={() => setShowConnectRequests(!showConnectRequests)}
            className={`relative h-6 w-11 rounded-full transition-colors ${showConnectRequests ? "bg-blue-500" : "bg-[#444]"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${showConnectRequests ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
      </section>

      <section className="mb-6 max-w-lg rounded border border-[#333] bg-[#252526] p-4">
        <h3 className="mb-3 text-sm font-medium">{t("updates.title")}</h3>
        <p className="mb-3 text-xs text-[#888]">
          {t("updates.currentVersion")}: {CURRENT_VERSION}
        </p>
        
        {updateAvailable && updateInfo && (
          <div className="mb-3 rounded border border-blue-500/30 bg-blue-500/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-400">
                {t("updates.updateAvailable")}
              </span>
              <span className="mono text-xs text-blue-300">
                {t("updates.version")}: {updateInfo.version}
              </span>
            </div>
            {updateInfo.body && (
              <div className="mb-3">
                <p className="text-xs text-[#888] mb-1">{t("updates.releaseNotes")}:</p>
                <pre className="text-xs text-[#aaa] whitespace-pre-wrap max-h-32 overflow-auto">
                  {updateInfo.body}
                </pre>
              </div>
            )}
            <button
              type="button"
              onClick={installUpdate}
              disabled={downloading}
              className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? `${t("updates.downloading")} ${downloadProgress}%` : t("updates.install")}
            </button>
          </div>
        )}
        
        <button
          type="button"
          onClick={checkForUpdates}
          disabled={checking || downloading}
          className="w-full rounded bg-[#333] px-3 py-2 text-sm hover:bg-[#444] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {checking ? t("updates.checking") : t("updates.check")}
        </button>
      </section>

      <section className="mb-6 max-w-lg rounded border border-[#333] bg-[#252526] p-4">
        <h3 className="mb-3 text-sm font-medium">{t("notifications.title")}</h3>
        <p className="text-xs text-[#888]">
          {t("notifications.checkReleases")}
        </p>
      </section>

      <section className="max-w-lg rounded border border-[#333] bg-[#252526] p-4">
        <h3 className="mb-3 text-sm font-medium">{t("settings.externalDevices")}</h3>
        <pre className="mono whitespace-pre-wrap text-xs text-[#aaa]">{hint}</pre>
      </section>
    </div>
  );
}
