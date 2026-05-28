import { useT } from "../hooks/useT";
import type { HttpMessage } from "../types";
import { normalizeMsg } from "./traffic/httpInspectorUtils";

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function TruncatedHint({
  size,
  truncated,
}: {
  size: number;
  truncated?: boolean;
}) {
  const t = useT();
  if (!truncated) return null;
  return (
    <p className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-1.5 text-xs text-amber-200/90">
      {t("traffic.inspector.truncated", { size })}
    </p>
  );
}

export function BodyViewer({
  msg,
  fill,
}: {
  msg?: HttpMessage;
  fill?: boolean;
}) {
  const t = useT();
  if (!msg) {
    return <div className="p-4 text-sm text-[#888]">{t("traffic.inspector.noContent")}</div>;
  }
  const normalized = normalizeMsg(msg);
  if (normalized.isBinary) {
    return (
      <div>
        <TruncatedHint size={normalized.size} truncated={normalized.truncated} />
        <div className="p-4 text-sm text-[#888]">
          {t("traffic.inspector.binary", { size: normalized.size })}
          {normalized.bodyBase64 ? (
            <pre className="mono scroll-thin mt-2 max-h-96 overflow-auto text-xs text-[#aaa]">
              {normalized.bodyBase64}
            </pre>
          ) : (
            <span className="mt-2 block text-[#666]">
              {t("traffic.inspector.bodyNotCached")}
            </span>
          )}
        </div>
      </div>
    );
  }
  const text = tryFormatJson(normalized.body);
  return (
    <div>
      <TruncatedHint size={normalized.size} truncated={normalized.truncated} />
      <pre
        className={`mono scroll-thin overflow-auto p-4 text-xs leading-relaxed text-[#d4d4d4] ${
          fill ? "min-h-0 flex-1" : "max-h-96"
        }`}
      >
        {text || "(empty)"}
      </pre>
    </div>
  );
}
