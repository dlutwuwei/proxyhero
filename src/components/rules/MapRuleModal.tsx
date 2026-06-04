import { useEffect, useState } from "react";
import { useT } from "../../hooks/useT";
import type { MapLocalRule, MapRemoteRule } from "../../types";
import {
  detectMapLocalHeaders,
  headersToRows,
  mergeMapLocalHeaders,
  rowsToHeaders,
} from "./mapLocalHeaders";

type RemoteDraft = MapRemoteRule;
type LocalDraft = MapLocalRule;
type LocalSourceMode = "file" | "body";

function normalizeMatchHost(host: string): string {
  let h = host.trim();
  h = h.replace(/^https?:\/\//i, "");
  const slash = h.indexOf("/");
  if (slash >= 0) h = h.slice(0, slash);
  return h.replace(/\/+$/, "");
}

function localSourceMode(rule: MapLocalRule): LocalSourceMode {
  return rule.localBody?.trim() ? "body" : "file";
}

function applyDetectedHeaders(
  draft: MapLocalRule,
  sourceMode: LocalSourceMode,
): MapLocalRule {
  const detected = detectMapLocalHeaders({
    sourceMode,
    localFile: draft.localFile,
    localBody: draft.localBody,
  });
  return {
    ...draft,
    headers: mergeMapLocalHeaders(draft.headers, detected),
  };
}

export function MapRemoteModal({
  open,
  initial,
  isNew,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: MapRemoteRule | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (rule: MapRemoteRule) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<RemoteDraft | null>(null);

  useEffect(() => {
    if (open && initial) setDraft({ ...initial });
  }, [open, initial]);

  if (!open || !draft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded border border-[#444] bg-[#252526] p-4 shadow-xl">
        <h3 className="mb-3 text-sm font-medium">
          {isNew ? t("rules.modal.addRemote") : t("rules.modal.editRemote")}
        </h3>
        <div className="space-y-2 text-xs">
          <label className="block">
            {t("rules.modal.name")}
            <input
              className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="block">
            {t("rules.modal.protocol")}
            <select
              className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.matchRule.protocol ?? "https"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, protocol: e.target.value },
                })
              }
            >
              <option value="https">https</option>
              <option value="http">http</option>
              <option value="*">*</option>
            </select>
          </label>
          <label className="block">
            {t("rules.modal.matchHost")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              placeholder="api.example.com"
              value={draft.matchRule.host}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, host: e.target.value },
                })
              }
            />
          </label>
          <label className="block">
            {t("rules.modal.matchPath")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              placeholder="/api/**"
              value={draft.matchRule.path ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, path: e.target.value },
                })
              }
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              {t("rules.modal.targetProtocol")}
              <select
                className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
                value={draft.mapTo.protocol}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mapTo: { ...draft.mapTo, protocol: e.target.value },
                  })
                }
              >
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </label>
            <label className="col-span-1 block">
              {t("rules.modal.targetHost")}
              <input
                className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
                value={draft.mapTo.host}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mapTo: { ...draft.mapTo, host: e.target.value },
                  })
                }
              />
            </label>
            <label className="block">
              {t("rules.modal.targetPort")}
              <input
                type="number"
                className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
                value={draft.mapTo.port}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mapTo: { ...draft.mapTo, port: Number(e.target.value) },
                  })
                }
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#333] px-3 py-1.5 text-xs hover:bg-[#444]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              const path = draft.matchRule.path?.trim();
              onSave({
                ...draft,
                matchRule: {
                  ...draft.matchRule,
                  path: path ? path : undefined,
                },
              });
            }}
            className="rounded bg-[#094771] px-3 py-1.5 text-xs hover:bg-[#0e5a8a]"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MapLocalModal({
  open,
  initial,
  isNew,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: MapLocalRule | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (rule: MapLocalRule) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<LocalDraft | null>(null);
  const [sourceMode, setSourceMode] = useState<LocalSourceMode>("file");
  const [headerRows, setHeaderRows] = useState<[string, string][]>([]);

  useEffect(() => {
    if (open && initial) {
      let next: MapLocalRule = {
        ...initial,
        autoHeaders: initial.autoHeaders ?? true,
      };
      const mode = localSourceMode(next);
      if (next.autoHeaders !== false) {
        next = applyDetectedHeaders(next, mode);
      }
      setDraft(next);
      setSourceMode(mode);
      setHeaderRows(headersToRows(next.headers));
    }
  }, [open, initial]);

  const syncHeaders = (rows: [string, string][]) => {
    setHeaderRows(rows);
    setDraft((prev) => (prev ? { ...prev, headers: rowsToHeaders(rows) } : prev));
  };

  const runDetectHeaders = () => {
    if (!draft) return;
    const next = applyDetectedHeaders(draft, sourceMode);
    setDraft(next);
    setHeaderRows(headersToRows(next.headers));
  };

  if (!open || !draft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded border border-[#444] bg-[#252526] p-4 shadow-xl">
        <h3 className="mb-3 text-sm font-medium">
          {isNew ? t("rules.modal.addLocal") : t("rules.modal.editLocal")}
        </h3>
        <div className="space-y-2 text-xs">
          <label className="block">
            {t("rules.modal.name")}
            <input
              className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="block">
            {t("rules.modal.matchHost")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              placeholder="trackstream.lkcoffee.com"
              value={draft.matchRule.host}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, host: e.target.value },
                })
              }
            />
          </label>
          <label className="block">
            {t("rules.modal.matchPath")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              placeholder="/api/employee/currentUser"
              value={draft.matchRule.path ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, path: e.target.value },
                })
              }
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSourceMode("file")}
              className={`rounded px-2 py-1 ${
                sourceMode === "file"
                  ? "bg-[#094771] text-white"
                  : "bg-[#333] hover:bg-[#444]"
              }`}
            >
              {t("rules.modal.sourceFile")}
            </button>
            <button
              type="button"
              onClick={() => setSourceMode("body")}
              className={`rounded px-2 py-1 ${
                sourceMode === "body"
                  ? "bg-[#094771] text-white"
                  : "bg-[#333] hover:bg-[#444]"
              }`}
            >
              {t("rules.modal.sourceBody")}
            </button>
          </div>
          {sourceMode === "file" ? (
            <label className="block">
              {t("rules.modal.localPath")}
              <input
                className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
                value={draft.localFile}
                onChange={(e) => {
                  const next = { ...draft, localFile: e.target.value };
                  setDraft(next);
                  if (next.autoHeaders !== false) {
                    const detected = applyDetectedHeaders(next, "file");
                    setDraft(detected);
                    setHeaderRows(headersToRows(detected.headers));
                  }
                }}
              />
            </label>
          ) : (
            <label className="block">
              {t("rules.modal.localBody")}
              <textarea
                className="mono mt-1 min-h-[160px] w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
                value={draft.localBody ?? ""}
                onChange={(e) => {
                  const next = { ...draft, localBody: e.target.value };
                  setDraft(next);
                  if (next.autoHeaders !== false) {
                    const detected = applyDetectedHeaders(next, "body");
                    setDraft(detected);
                    setHeaderRows(headersToRows(detected.headers));
                  }
                }}
              />
            </label>
          )}
          <label className="block">
            {t("rules.modal.statusCode")}
            <input
              type="number"
              className="mt-1 w-32 rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.status}
              onChange={(e) =>
                setDraft({ ...draft, status: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.autoHeaders !== false}
              onChange={(e) => {
                const autoHeaders = e.target.checked;
                let next = { ...draft, autoHeaders };
                if (autoHeaders) {
                  next = applyDetectedHeaders(next, sourceMode);
                  setHeaderRows(headersToRows(next.headers));
                }
                setDraft(next);
              }}
            />
            {t("rules.modal.autoHeaders")}
          </label>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span>{t("rules.modal.responseHeaders")}</span>
              <button
                type="button"
                onClick={runDetectHeaders}
                className="rounded bg-[#333] px-2 py-0.5 hover:bg-[#444]"
              >
                {t("rules.modal.detectHeaders")}
              </button>
            </div>
            <div className="space-y-1 rounded border border-[#444] bg-[#1e1e1e] p-2">
              {headerRows.map(([key, value], index) => (
                <div key={index} className="flex gap-1">
                  <input
                    className="mono w-36 rounded border border-[#444] bg-[#252526] px-2 py-1"
                    placeholder="Content-Type"
                    value={key}
                    onChange={(e) => {
                      const rows = [...headerRows];
                      rows[index] = [e.target.value, value];
                      syncHeaders(rows);
                    }}
                  />
                  <input
                    className="mono min-w-0 flex-1 rounded border border-[#444] bg-[#252526] px-2 py-1"
                    placeholder="application/json"
                    value={value}
                    onChange={(e) => {
                      const rows = [...headerRows];
                      rows[index] = [key, e.target.value];
                      syncHeaders(rows);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      syncHeaders(headerRows.filter((_, i) => i !== index));
                    }}
                    className="rounded px-2 text-[#888] hover:bg-[#333] hover:text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => syncHeaders([...headerRows, ["", ""]])}
                className="rounded bg-[#333] px-2 py-0.5 hover:bg-[#444]"
              >
                {t("rules.modal.addHeader")}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#333] px-3 py-1.5 text-xs hover:bg-[#444]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              const path = draft.matchRule.path?.trim();
              const host = normalizeMatchHost(draft.matchRule.host);
              const next: MapLocalRule = {
                ...draft,
                headers: rowsToHeaders(headerRows),
                autoHeaders: draft.autoHeaders !== false,
                matchRule: {
                  ...draft.matchRule,
                  host,
                  path: path ? path : undefined,
                },
              };
              if (sourceMode === "body") {
                next.localBody = draft.localBody?.trim() || "";
                next.localFile = "";
              } else {
                next.localFile = draft.localFile.trim();
                next.localBody = undefined;
              }
              onSave(next);
            }}
            className="rounded bg-[#094771] px-3 py-1.5 text-xs hover:bg-[#0e5a8a]"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
