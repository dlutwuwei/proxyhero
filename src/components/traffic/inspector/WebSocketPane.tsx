import { useState } from "react";
import { useT } from "../../../hooks/useT";
import type { TranslationKey } from "../../../i18n/messages";
import type { WebSocketMessage } from "../../../types";
import { formatSessionTime } from "../../../utils/formatTime";
import { tryParseJson } from "../httpInspectorUtils";
import { JsonTreeView } from "./JsonTreeView";

function payloadText(msg: WebSocketMessage): string {
  if (msg.isBinary && msg.payloadBase64) {
    try {
      const raw = atob(msg.payloadBase64);
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      if (bytes.every((b) => b >= 0x20 && b <= 0x7e)) {
        return new TextDecoder().decode(bytes);
      }
      return `[binary ${msg.size} bytes]`;
    } catch {
      return `[binary ${msg.size} bytes]`;
    }
  }
  return msg.payload;
}

function opcodeColor(opcode: string): string {
  switch (opcode) {
    case "text":
      return "bg-emerald-900/50 text-emerald-300";
    case "binary":
      return "bg-violet-900/50 text-violet-300";
    case "ping":
    case "pong":
      return "bg-[#333] text-[#888]";
    case "close":
      return "bg-red-900/50 text-red-300";
    default:
      return "bg-[#333] text-[#aaa]";
  }
}

function directionLabel(
  direction: WebSocketMessage["direction"],
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  return direction === "client"
    ? t("traffic.inspector.wsClient")
    : t("traffic.inspector.wsServer");
}

export function WebSocketPane({
  messages,
}: {
  messages: WebSocketMessage[];
}) {
  const t = useT();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[#666]">
        {t("traffic.inspector.noWsMessages")}
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#2d2d2d]">
      {messages.map((msg, idx) => {
        const text = payloadText(msg);
        const json = msg.opcode === "text" ? tryParseJson(text) : null;
        const expanded = expandedIdx === idx;

        return (
          <div key={`${msg.timestamp}-${idx}`} className="px-2 py-1.5 hover:bg-[#2a2d2e]">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left text-xs"
              onClick={() => setExpandedIdx(expanded ? null : idx)}
            >
              <span className="mono w-[72px] shrink-0 text-[#666]">
                {formatSessionTime(msg.timestamp)}
              </span>
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${
                  msg.direction === "client"
                    ? "text-sky-300"
                    : "text-amber-300"
                }`}
              >
                {directionLabel(msg.direction, t)}
              </span>
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-[10px] uppercase ${opcodeColor(msg.opcode)}`}
              >
                {msg.opcode}
              </span>
              <span className="mono min-w-0 flex-1 truncate text-[#ccc]">
                {text || `(${msg.opcode})`}
              </span>
              <span className="mono shrink-0 text-[#666]">{msg.size}b</span>
            </button>
            {expanded && (
              <div className="mt-1 max-h-64 overflow-auto rounded border border-[#333] bg-[#1e1e1e]">
                {json != null ? (
                  <JsonTreeView text={text} />
                ) : (
                  <pre className="mono whitespace-pre-wrap break-all p-2 text-xs text-[#ccc]">
                    {text || t("traffic.inspector.noContent")}
                  </pre>
                )}
                {msg.truncated && (
                  <p className="border-t border-[#333] px-2 py-1 text-[10px] text-amber-400">
                    {t("traffic.inspector.wsTruncated", { size: msg.size })}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
