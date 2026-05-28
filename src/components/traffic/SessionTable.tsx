import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../../hooks/useT";
import type { Session } from "../../types";
import { copyToClipboard } from "../../utils/clipboard";
import { SessionRow } from "./SessionRow";

export function SessionTable({
  sessions,
  seqById,
  selectedId,
  onSelect,
  emptyHint,
}: {
  sessions: Session[];
  seqById: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint: string;
}) {
  const t = useT();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevSelectedIdRef = useRef<string | null>(null);

  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 25,
  });

  useEffect(() => {
    if (!selectedId) {
      prevSelectedIdRef.current = null;
      return;
    }
    if (prevSelectedIdRef.current === selectedId) return;
    prevSelectedIdRef.current = selectedId;
    const idx = sessions.findIndex((s) => s.id === selectedId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [selectedId, sessions, virtualizer]);

  const copyUrl = (url: string) => {
    void copyToClipboard(url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-[#333] bg-[#252526] px-2 py-1.5 text-[11px] font-medium text-[#888]">
        <span className="w-12 shrink-0 text-right">#</span>
        <span className="min-w-0 flex-1">URL</span>
        <span className="w-28 shrink-0">{t("traffic.col.client")}</span>
        <span className="w-16 shrink-0">{t("traffic.col.method")}</span>
        <span className="w-20 shrink-0">{t("traffic.col.status")}</span>
        <span className="w-[72px] shrink-0">{t("traffic.col.time")}</span>
      </div>
      <div ref={parentRef} className="scroll-thin min-h-0 flex-1 overflow-auto">
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#666]">{emptyHint}</div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const session = sessions[vi.index];
              return (
                <div
                  key={session.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <SessionRow
                    session={session}
                    seq={seqById.get(session.id) ?? vi.index + 1}
                    selected={session.id === selectedId}
                    onClick={() => onSelect(session.id)}
                    onDoubleClick={() => copyUrl(session.url)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
