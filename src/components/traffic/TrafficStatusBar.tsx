import { useProxyEnabled } from "../ProxyControl";
import { useTrafficThroughput } from "../../hooks/useFilteredSessions";
import { useT } from "../../hooks/useT";
import { useAppStore } from "../../stores/appStore";
import { useTrafficStore } from "../../stores/trafficStore";

export function TrafficStatusBar({
  filteredCount,
  totalCount,
}: {
  filteredCount: number;
  totalCount: number;
}) {
  const t = useT();
  const sessions = useAppStore((s) => s.sessions);
  const selectedId = useAppStore((s) => s.selectedId);
  const clearSession = useAppStore((s) => s.clearSession);
  const proxyEnabled = useProxyEnabled();
  const rules = useAppStore((s) => s.rules);
  const autoSelect = useTrafficStore((s) => s.autoSelect);
  const setAutoSelect = useTrafficStore((s) => s.setAutoSelect);
  const { kbPerSec, totalMb } = useTrafficThroughput(sessions);

  const mapEnabled =
    (rules?.mapRemote.filter((r) => r.enabled).length ?? 0) +
    (rules?.mapLocal.filter((r) => r.enabled).length ?? 0);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[#333] bg-[#252526] px-3 py-1.5 text-[11px] text-[#888]">
      <button
        type="button"
        disabled={!selectedId}
        onClick={() => selectedId && clearSession(selectedId)}
        className="rounded bg-[#333] px-2 py-0.5 text-[#ccc] hover:bg-[#444] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("traffic.clearSelected")}
      </button>
      <label className="flex cursor-pointer items-center gap-1.5 text-[#ccc]">
        <input
          type="checkbox"
          checked={autoSelect}
          onChange={(e) => setAutoSelect(e.target.checked)}
          className="rounded"
        />
        {t("traffic.autoSelect")}
      </label>
      <span>
        {t("traffic.selected", {
          selected: selectedId ? 1 : 0,
          filtered: filteredCount,
        })}
        {filteredCount !== totalCount &&
          t("traffic.selectedTotal", { total: totalCount })}
      </span>
      <span className="text-[#666]">
        {totalMb.toFixed(1)} MB · {kbPerSec.toFixed(1)} KB/s
      </span>
      <span className="ml-auto flex gap-2">
        {proxyEnabled && (
          <span className="text-emerald-500/80">{t("proxy.enabledStatus")}</span>
        )}
        {mapEnabled > 0 && <span>Map ×{mapEnabled}</span>}
      </span>
    </div>
  );
}
