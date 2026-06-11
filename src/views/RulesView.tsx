import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/tauri";
import { formatMapTarget, newLocalRule, newRemoteRule } from "../components/rules/mapRuleDefaults";
import { MapLocalModal, MapRemoteModal } from "../components/rules/MapRuleModal";
import { useT } from "../hooks/useT";
import { useAppStore } from "../stores/appStore";
import type { AppRules, MapLocalRule, MapRemoteRule, Preset } from "../types";

function RulesTable({
  children,
  columns,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-auto rounded border border-[#333]">
      <table className="w-full min-w-[720px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#333] bg-[#2d2d2d] text-left text-[#888]">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function RulesView() {
  const t = useT();
  const rules = useAppStore((s) => s.rules);
  const loadRules = useAppStore((s) => s.loadRules);
  const setMessage = useAppStore((s) => s.setMessage);
  const pendingRemoteRule = useAppStore((s) => s.pendingRemoteRule);
  const clearPendingRemoteRule = useAppStore((s) => s.clearPendingRemoteRule);
  const pendingLocalRule = useAppStore((s) => s.pendingLocalRule);
  const clearPendingLocalRule = useAppStore((s) => s.clearPendingLocalRule);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [tab, setTab] = useState<"remote" | "local">("remote");
  const [remoteModal, setRemoteModal] = useState<MapRemoteRule | null>(null);
  const [localModal, setLocalModal] = useState<MapLocalRule | null>(null);

  useEffect(() => {
    api.getPresets().then(setPresets);
  }, []);

  useEffect(() => {
    if (!pendingRemoteRule) return;
    setTab("remote");
    setRemoteModal(pendingRemoteRule);
    clearPendingRemoteRule();
  }, [pendingRemoteRule, clearPendingRemoteRule]);

  useEffect(() => {
    if (!pendingLocalRule) return;
    setTab("local");
    setLocalModal(pendingLocalRule);
    clearPendingLocalRule();
  }, [pendingLocalRule, clearPendingLocalRule]);

  if (!rules) return null;

  const save = async (next: AppRules) => {
    await api.saveRules(next);
    await loadRules();
    setMessage(t("rules.saved"));
    setTimeout(() => setMessage(null), 2000);
  };

  const applyPreset = async (id: string) => {
    await api.applyPreset(id);
    await loadRules();
    setMessage(t("rules.presetApplied"));
    setTimeout(() => setMessage(null), 2000);
  };

  const remoteColumns = [
    t("common.enabled"),
    t("rules.col.name"),
    t("rules.col.matchHost"),
    t("rules.col.path"),
    t("rules.col.mapTo"),
    t("rules.col.actions"),
  ];

  const localColumns = [
    t("common.enabled"),
    t("rules.col.name"),
    t("rules.col.matchHost"),
    t("rules.col.path"),
    t("rules.col.localFile"),
    t("rules.col.actions"),
  ];

  const toggleRemote = (id: string, enabled: boolean) => {
    save({
      ...rules,
      mapRemote: rules.mapRemote.map((r) =>
        r.id === id ? { ...r, enabled } : r,
      ),
    });
  };

  const toggleLocal = (id: string, enabled: boolean) => {
    save({
      ...rules,
      mapLocal: rules.mapLocal.map((r) =>
        r.id === id ? { ...r, enabled } : r,
      ),
    });
  };

  const enableAllRemote = () => {
    save({
      ...rules,
      mapRemote: rules.mapRemote.map((r) => ({ ...r, enabled: true })),
    });
  };

  const disableAllRemote = () => {
    save({
      ...rules,
      mapRemote: rules.mapRemote.map((r) => ({ ...r, enabled: false })),
    });
  };

  const enableAllLocal = () => {
    save({
      ...rules,
      mapLocal: rules.mapLocal.map((r) => ({ ...r, enabled: true })),
    });
  };

  const disableAllLocal = () => {
    save({
      ...rules,
      mapLocal: rules.mapLocal.map((r) => ({ ...r, enabled: false })),
    });
  };

  const saveRemote = (rule: MapRemoteRule) => {
    const exists = rules.mapRemote.some((r) => r.id === rule.id);
    const mapRemote = exists
      ? rules.mapRemote.map((r) => (r.id === rule.id ? rule : r))
      : [...rules.mapRemote, rule];
    save({ ...rules, mapRemote });
    setRemoteModal(null);
  };

  const saveLocal = (rule: MapLocalRule) => {
    const exists = rules.mapLocal.some((r) => r.id === rule.id);
    const mapLocal = exists
      ? rules.mapLocal.map((r) => (r.id === rule.id ? rule : r))
      : [...rules.mapLocal, rule];
    save({ ...rules, mapLocal });
    setLocalModal(null);
  };

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      <h2 className="mb-4 text-lg font-medium">{t("rules.title")}</h2>

      <section className="mb-6 rounded border border-[#333] bg-[#252526] p-4">
        <h3 className="mb-2 text-sm font-medium text-[#ccc]">{t("rules.presets")}</h3>
        <div className="flex flex-wrap gap-2">
          {presets.length === 0 && (
            <span className="text-xs text-[#666]">{t("rules.loadingPresets")}</span>
          )}
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.description}
              onClick={() => applyPreset(p.id)}
              className="rounded bg-[#094771] px-3 py-1.5 text-xs hover:bg-[#0e5a8a]"
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("remote")}
          className={`rounded px-3 py-1 text-sm ${tab === "remote" ? "bg-[#094771]" : "bg-[#333]"}`}
        >
          {t("rules.mapRemote")}
        </button>
        <button
          type="button"
          onClick={() => setTab("local")}
          className={`rounded px-3 py-1 text-sm ${tab === "local" ? "bg-[#094771]" : "bg-[#333]"}`}
        >
          {t("rules.mapLocal")}
        </button>
      </div>

      {tab === "remote" && (
        <>
          {rules.mapRemote.length > 0 && (
            <div className="mb-2 flex items-center justify-start gap-2">
              <button
                type="button"
                className="rounded bg-[#333] px-3 py-1 text-xs hover:bg-[#444]"
                onClick={enableAllRemote}
              >
                {t("common.enableAll")}
              </button>
              <button
                type="button"
                className="rounded bg-[#333] px-3 py-1 text-xs hover:bg-[#444]"
                onClick={disableAllRemote}
              >
                {t("common.disableAll")}
              </button>
            </div>
          )}
          {rules.mapRemote.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-xs text-[#666] mb-4">{t("rules.emptyRemote")}</p>
              <button
                type="button"
                className="rounded bg-[#094771] px-4 py-2 text-sm font-medium hover:bg-[#0e5a8a] shadow-lg"
                onClick={() => setRemoteModal(newRemoteRule())}
              >
                {t("rules.addRemote")}
              </button>
            </div>
          ) : (
            <>
              <RulesTable columns={remoteColumns}>
                {rules.mapRemote.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-[#333] hover:bg-[#2a2d2e] ${
                      !r.enabled ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => toggleRemote(r.id, e.target.checked)}
                        aria-label={`${t("common.enabled")} ${r.name}`}
                      />
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2 text-[#ccc]">
                      {r.name}
                    </td>
                    <td className="mono max-w-[200px] truncate px-3 py-2">
                      {r.matchRule.protocol ? `${r.matchRule.protocol}://` : ""}
                      {r.matchRule.host}
                    </td>
                    <td className="mono max-w-[100px] truncate px-3 py-2 text-[#888]">
                      {r.matchRule.path || "/*"}
                    </td>
                    <td className="mono px-3 py-2 text-emerald-400/90">
                      {formatMapTarget(
                        r.mapTo.protocol,
                        r.mapTo.host,
                        r.mapTo.port,
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-[#9cdcfe] hover:underline"
                          onClick={() => setRemoteModal({ ...r })}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          className="text-red-400 hover:underline"
                          onClick={() =>
                            save({
                              ...rules,
                              mapRemote: rules.mapRemote.filter(
                                (x) => x.id !== r.id,
                              ),
                            })
                          }
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </RulesTable>
              <div className="mt-3 flex justify-start">
                <button
                  type="button"
                  className="rounded bg-[#094771] px-4 py-2 text-sm font-medium hover:bg-[#0e5a8a] shadow-lg"
                  onClick={() => setRemoteModal(newRemoteRule())}
                >
                  {t("rules.addRemote")}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === "local" && (
        <>
          {rules.mapLocal.length > 0 && (
            <div className="mb-2 flex items-center justify-start gap-2">
              <button
                type="button"
                className="rounded bg-[#333] px-3 py-1 text-xs hover:bg-[#444]"
                onClick={enableAllLocal}
              >
                {t("common.enableAll")}
              </button>
              <button
                type="button"
                className="rounded bg-[#333] px-3 py-1 text-xs hover:bg-[#444]"
                onClick={disableAllLocal}
              >
                {t("common.disableAll")}
              </button>
            </div>
          )}
          {rules.mapLocal.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-xs text-[#666] mb-4">{t("rules.emptyLocal")}</p>
              <button
                type="button"
                className="rounded bg-[#094771] px-4 py-2 text-sm font-medium hover:bg-[#0e5a8a] shadow-lg"
                onClick={() => setLocalModal(newLocalRule())}
              >
                {t("rules.addLocal")}
              </button>
            </div>
          ) : (
            <>
              <RulesTable columns={localColumns}>
                {rules.mapLocal.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-[#333] hover:bg-[#2a2d2e] ${
                      !r.enabled ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => toggleLocal(r.id, e.target.checked)}
                        aria-label={`${t("common.enabled")} ${r.name}`}
                      />
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2">{r.name}</td>
                    <td className="mono max-w-[180px] truncate px-3 py-2">
                      {r.matchRule.host}
                    </td>
                    <td className="mono max-w-[100px] truncate px-3 py-2 text-[#888]">
                      {r.matchRule.path || "/*"}
                    </td>
                    <td
                      className="mono max-w-[200px] truncate px-3 py-2 text-[#888]"
                      title={r.localFile}
                    >
                      {r.localFile || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-[#9cdcfe] hover:underline"
                          onClick={() => setLocalModal({ ...r })}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          className="text-red-400 hover:underline"
                          onClick={() =>
                            save({
                              ...rules,
                              mapLocal: rules.mapLocal.filter(
                                (x) => x.id !== r.id,
                              ),
                            })
                          }
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </RulesTable>
              <div className="mt-3 flex justify-start">
                <button
                  type="button"
                  className="rounded bg-[#094771] px-4 py-2 text-sm font-medium hover:bg-[#0e5a8a] shadow-lg"
                  onClick={() => setLocalModal(newLocalRule())}
                >
                  {t("rules.addLocal")}
                </button>
              </div>
            </>
          )}
        </>
      )}

      <MapRemoteModal
        open={remoteModal !== null}
        initial={remoteModal}
        isNew={
          remoteModal !== null &&
          !rules.mapRemote.some((r) => r.id === remoteModal.id)
        }
        onClose={() => setRemoteModal(null)}
        onSave={saveRemote}
      />
      <MapLocalModal
        open={localModal !== null}
        initial={localModal}
        isNew={
          localModal !== null &&
          !rules.mapLocal.some((r) => r.id === localModal.id)
        }
        onClose={() => setLocalModal(null)}
        onSave={saveLocal}
      />
    </div>
  );
}
