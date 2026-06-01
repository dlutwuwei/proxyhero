import { useCallback, useRef, useState, type PointerEvent } from "react";
import { api } from "../../api/tauri";
import { useT } from "../../hooks/useT";
import { useAppStore } from "../../stores/appStore";
import { copyToClipboard } from "../../utils/clipboard";
import type { Session } from "../../types";
import { statusLabel } from "./httpInspectorUtils";
import { RequestPane } from "./inspector/RequestPane";
import { ResponsePane } from "./inspector/ResponsePane";
import { WebSocketPane } from "./inspector/WebSocketPane";

function StatusPill({ session }: { session: Session }) {
  const t = useT();
  if (!session.completed) {
    return (
      <span className="rounded bg-amber-700/80 px-2 py-0.5 text-xs font-medium text-white">
        {session.isWebSocket
          ? t("traffic.inspector.wsActive")
          : t("traffic.inspector.active")}
      </span>
    );
  }
  const status = session.status ?? 0;
  const ok = status >= 200 && status < 300;
  const err = status >= 400;
  const cls = err
    ? "bg-red-700/80"
    : ok
      ? "bg-emerald-700/80"
      : "bg-amber-700/80";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium text-white ${cls}`}>
      {statusLabel(session.status)}
    </span>
  );
}

export function SessionInspector({ session }: { session: Session | undefined }) {
  const t = useT();
  const setMessage = useAppStore((s) => s.setMessage);
  const [splitPct, setSplitPct] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.min(75, Math.max(25, pct)));
  }, []);

  const onPointerUp = useCallback((e: PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#666]">
        {t("traffic.inspector.empty")}
      </div>
    );
  }

  const copyCurl = async () => {
    try {
      const curl = await api.sessionToCurl(session.id);
      await copyToClipboard(curl);
      setMessage(t("traffic.inspector.curlCopied"));
      setTimeout(() => setMessage(null), 2000);
    } catch (e) {
      setMessage(String(e));
    }
  };

  const isWebSocket = session.isWebSocket;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#252526]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#333] px-3 py-2">
        <span className="rounded bg-emerald-700/80 px-2 py-0.5 text-xs font-medium text-white">
          {isWebSocket ? "WS" : session.method}
        </span>
        <StatusPill session={session} />
        <div className="mono min-w-0 flex-1 truncate text-xs text-emerald-400">
          {session.url}
        </div>
        {!isWebSocket && (
          <button
            type="button"
            onClick={() => copyCurl()}
            className="shrink-0 rounded bg-[#333] px-2 py-1 text-xs text-[#ccc] hover:bg-[#444]"
          >
            {t("traffic.inspector.copyCurl")}
          </button>
        )}
      </div>
      {session.mappedRuleName && (
        <div className="shrink-0 border-b border-[#333] px-3 py-1 text-xs text-violet-300">
          {t("traffic.inspector.rule")}: {session.mappedRuleName}
        </div>
      )}
      <div ref={containerRef} className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 min-w-0 flex-col border-r border-[#333]"
          style={{ width: isWebSocket ? "35%" : `${splitPct}%` }}
        >
          <RequestPane session={session} />
        </div>
        {!isWebSocket && (
          <div
            role="separator"
            aria-orientation="vertical"
            className="w-1 shrink-0 cursor-col-resize bg-[#2d2d2d] hover:bg-[#3794ff]/40"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isWebSocket ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-[#333] px-3 py-2 text-xs font-medium text-[#ccc]">
                {t("traffic.inspector.wsMessages")} (
                {session.websocketMessages?.length ?? 0})
              </div>
              <div className="scroll-thin min-h-0 flex-1 overflow-auto">
                <WebSocketPane messages={session.websocketMessages ?? []} />
              </div>
            </div>
          ) : (
            <ResponsePane session={session} />
          )}
        </div>
      </div>
    </div>
  );
}
