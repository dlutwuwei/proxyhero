import { useEffect, useMemo } from "react";
import { ResizablePane } from "../components/traffic/ResizablePane";
import { SessionInspector } from "../components/traffic/SessionInspector";
import { SessionTable } from "../components/traffic/SessionTable";
import { SourceSidebar } from "../components/traffic/SourceSidebar";
import { TrafficStatusBar } from "../components/traffic/TrafficStatusBar";
import { TrafficToolbar } from "../components/traffic/TrafficToolbar";
import { useProxyEnabled } from "../components/ProxyControl";
import { useFilteredSessions } from "../hooks/useFilteredSessions";
import { useT } from "../hooks/useT";
import { useAppStore } from "../stores/appStore";
import { useTrafficStore } from "../stores/trafficStore";

export function TrafficView() {
  const t = useT();
  const sessions = useAppStore((s) => s.sessions);
  const selectedId = useAppStore((s) => s.selectedId);
  const selectSession = useAppStore((s) => s.selectSession);
  const proxyEnabled = useProxyEnabled();
  const inspectorHeight = useTrafficStore((s) => s.inspectorHeight);
  const setInspectorHeight = useTrafficStore((s) => s.setInspectorHeight);

  const { filtered, domainGroups, appGroups, seqById } =
    useFilteredSessions(sessions);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId),
    [sessions, selectedId],
  );

  const emptyHint = proxyEnabled
    ? t("traffic.waiting")
    : t("traffic.startHint");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const idx = filtered.findIndex((s) => s.id === selectedId);
      if (filtered.length === 0) return;
      const next =
        e.key === "ArrowUp"
          ? Math.max(0, idx <= 0 ? 0 : idx - 1)
          : Math.min(filtered.length - 1, idx < 0 ? 0 : idx + 1);
      selectSession(filtered[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedId, selectSession]);

  return (
    <div className="flex h-full min-h-0 flex-row">
      <SourceSidebar domainGroups={domainGroups} appGroups={appGroups} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TrafficToolbar />
        <div className="flex min-h-0 flex-1 flex-col">
          <SessionTable
            sessions={filtered}
            seqById={seqById}
            selectedId={selectedId}
            onSelect={selectSession}
            emptyHint={emptyHint}
          />
          <ResizablePane
            height={inspectorHeight}
            onResize={setInspectorHeight}
          >
            <SessionInspector session={selected} />
          </ResizablePane>
        </div>
        <TrafficStatusBar
          filteredCount={filtered.length}
          totalCount={sessions.length}
        />
      </div>
    </div>
  );
}
