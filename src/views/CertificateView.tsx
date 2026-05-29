import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api/tauri";
import { useT } from "../hooks/useT";
import { useAppStore } from "../stores/appStore";
import type { CertDiagnostic } from "../types";

export function CertificateView() {
  const t = useT();
  const certInfo = useAppStore((s) => s.certInfo);
  const loadCert = useAppStore((s) => s.loadCert);
  const setMessage = useAppStore((s) => s.setMessage);
  const proxyStatus = useAppStore((s) => s.proxyStatus);
  const refreshStatus = useAppStore((s) => s.refreshStatus);
  const [diag, setDiag] = useState<CertDiagnostic | null>(null);

  const refreshDiag = useCallback(async () => {
    setDiag(await api.getCertDiagnostic());
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshDiag();
  }, [refreshDiag, refreshStatus]);

  const ensure = async () => {
    try {
      await api.ensureCa();
      await loadCert();
      await refreshDiag();
      setMessage(t("cert.caGenerated"));
    } catch (e) {
      setMessage(String(e));
    }
  };

  const install = async () => {
    try {
      const msg = await api.installCa();
      await refreshDiag();
      setMessage(msg);
    } catch (e) {
      setMessage(String(e));
    }
  };

  const regen = async () => {
    if (!confirm(t("cert.regenerateConfirm"))) return;
    await api.regenerateCa();
    await loadCert();
    await refreshDiag();
    setMessage(t("cert.caRegenerated"));
  };

  const certDownloadUrl = proxyStatus?.lanIp
    ? `http://${proxyStatus.lanIp}:${proxyStatus.port}/proxyhero/ca.crt`
    : proxyStatus?.running
      ? `http://127.0.0.1:${proxyStatus.port}/proxyhero/ca.crt`
      : "";

  return (
    <div className="overflow-auto p-4">
      <h2 className="mb-4 text-lg font-medium">{t("cert.title")}</h2>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[300px] rounded border border-[#333] bg-[#252526] p-4 text-sm">
          <h3 className="mb-2 font-medium text-[#ccc]">{t("cert.trustDiag")}</h3>
          {diag && (
            <>
              <dl className="space-y-1 text-xs">
                <dt className="text-[#888]">{t("cert.caFingerprint")}</dt>
                <dd className="mono break-all">{diag.caFingerprint ?? "-"}</dd>
                <dt className="text-[#888]">{t("cert.keychainFingerprint")}</dt>
                <dd className="mono break-all">
                  {diag.keychainFingerprint ?? t("cert.notFound")}
                </dd>
                <dt className="text-[#888]">{t("cert.fingerprintMatch")}</dt>
                <dd className={diag.fingerprintsMatch ? "text-emerald-400" : "text-red-400"}>
                  {diag.fingerprintsMatch ? t("common.yes") : t("common.no")}
                </dd>
              </dl>
              <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-200/90">
                {diag.hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  refreshStatus();
                  refreshDiag();
                }}
                className="mt-3 text-xs text-[#3794ff] hover:underline"
              >
                {t("cert.refreshDiag")}
              </button>
            </>
          )}

          <div className="mt-4 pt-4 border-t border-[#333]">
            <dl className="space-y-2">
              <dt className="text-[#888]">{t("cert.status")}</dt>
              <dd>{certInfo?.exists ? t("cert.generated") : t("cert.notGenerated")}</dd>
              <dt className="text-[#888]">{t("cert.path")}</dt>
              <dd className="mono break-all text-xs">{certInfo?.path ?? "-"}</dd>
              <dt className="text-[#888]">SHA-256</dt>
              <dd className="mono break-all text-xs">
                {certInfo?.fingerprint ?? "-"}
              </dd>
            </dl>
            <p className="mt-4 text-xs text-[#888]">{certInfo?.installedHint}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => ensure()}
                className="rounded bg-[#333] px-3 py-1.5 hover:bg-[#444]"
              >
                {t("cert.generate")}
              </button>
              <button
                type="button"
                onClick={() => install()}
                className="rounded bg-emerald-800 px-3 py-1.5 hover:bg-emerald-700"
              >
                {t("cert.install")}
              </button>
              <button
                type="button"
                onClick={() => api.openCertDir()}
                className="rounded bg-[#333] px-3 py-1.5 hover:bg-[#444]"
              >
                {t("cert.openDir")}
              </button>
              <button
                type="button"
                onClick={() => regen()}
                className="rounded bg-red-900/60 px-3 py-1.5 hover:bg-red-800"
              >
                {t("cert.regenerate")}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-[300px] rounded border border-[#333] bg-[#252526] p-4 text-sm">
          <h3 className="mb-3 font-medium text-[#ccc]">{t("cert.mobileSetup")}</h3>

          {certInfo?.exists ? (
            proxyStatus?.running ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center">
                  <div className="mb-2 rounded-lg bg-white p-3">
                    {certDownloadUrl && (
                      <QRCodeSVG value={certDownloadUrl} size={160} level="L" />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[#888]">{t("cert.scanQr")}</p>
                </div>

                <div className="space-y-2 text-xs text-[#ccc]">
                  <p className="font-medium text-[#3794ff]">{t("cert.setupSteps")}</p>
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>{t("cert.step1")}</li>
                    <li>
                      {t("cert.step2")}
                      <span className="mono text-emerald-300">{certDownloadUrl}</span>
                    </li>
                    <li>{t("cert.step3")}</li>
                    <li>{t("cert.step4")}</li>
                    <li className="pl-4">
                      {t("cert.stepServer")}
                      <span className="mono text-emerald-300">
                        {proxyStatus.lanIp ?? "127.0.0.1"}
                      </span>
                    </li>
                    <li className="pl-4">
                      {t("cert.stepPort")}
                      <span className="mono text-emerald-300">{proxyStatus.port}</span>
                    </li>
                    <li>{t("cert.step5")}</li>
                  </ol>
                </div>

                <div className="rounded border border-[#333] bg-[#1e1e1e] p-3">
                  <p className="text-xs text-[#888]">{t("cert.proxyAddr")}</p>
                  <p className="mono mt-1 text-sm text-emerald-300">
                    {proxyStatus.lanIp ?? "127.0.0.1"}:{proxyStatus.port}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-amber-200/90">{t("cert.startProxyFirst")}</div>
            )
          ) : (
            <div className="text-xs text-amber-200/90">{t("cert.generateFirst")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
