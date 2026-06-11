import { useT } from "../../hooks/useT";
import type { Session } from "../../types";
import { formatSessionTime } from "../../utils/formatTime";

function statusColor(status?: number) {
  if (!status) return "text-[#888]";
  if (status >= 200 && status < 300) return "text-emerald-400";
  if (status >= 400) return "text-red-400";
  return "text-amber-300";
}

export function SessionRow({
  session,
  seq,
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  session: Session;
  seq: number;
  selected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const t = useT();
  const client = session.userAgent?.trim()
    ? session.clientName || session.clientAddr || "—"
    : t("traffic.unidentifiedClient");
  const clientTitle = [session.clientName, session.userAgent, session.clientAddr]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`flex cursor-pointer items-center gap-2 border-b border-[#2d2d2d] px-2 py-1 text-xs hover:bg-[#2a2d2e] ${
        selected ? "bg-[#094771]/60" : ""
      }`}
    >
      <span data-col="seq" className="mono w-12 shrink-0 text-right text-[#666]">{seq}</span>
      <span data-col="url" className="mono min-w-0 flex-1 truncate text-[#ccc]" title={session.url}>
        {session.url}
      </span>
      <span data-col="client" className="w-28 shrink-0 truncate text-[#888]" title={clientTitle}>
        {client}
      </span>
      <span data-col="method" className="mono w-16 shrink-0 font-medium text-[#569cd6]">
        {session.isWebSocket ? "WS" : session.method}
      </span>
      <span
        data-col="status"
        className={`flex w-20 shrink-0 items-center gap-1 ${statusColor(session.status)}`}
      >
        {!session.completed ? (
          <>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-emerald-400">{t("traffic.filter.active")}</span>
          </>
        ) : (
          <span>{session.status ?? "—"}</span>
        )}
      </span>
      {session.mapType && (
        <span className="shrink-0 rounded bg-violet-900/50 px-1 text-[10px] text-violet-300">
          {session.mapType}
        </span>
      )}
      {session.isWebSocket && (
        <span className="shrink-0 rounded bg-sky-900/50 px-1 text-[10px] text-sky-300">
          WS
        </span>
      )}
      <span
        data-col="time"
        className="mono w-[72px] shrink-0 text-right text-[#888]"
        title={session.startedAt}
      >
        {formatSessionTime(session.startedAt)}
      </span>
    </div>
  );
}
