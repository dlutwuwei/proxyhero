import { useMemo, useState } from "react";
import { useT } from "../hooks/useT";
import type { HttpMessage } from "../types";
import { copyToClipboard } from "../utils/clipboard";
import { normalizeMsg } from "./traffic/httpInspectorUtils";
import { BodyCodeEditor } from "./traffic/inspector/BodyCodeEditor";

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
    <p className="shrink-0 border-b border-amber-900/50 bg-amber-950/40 px-4 py-1.5 text-xs text-amber-200/90">
      {t("traffic.inspector.truncated", { size })}
    </p>
  );
}

function contentTypeOf(msg: HttpMessage): string | undefined {
  return msg.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1];
}

function bodyByteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function BodyViewer({
  msg,
  fill,
  autoFormat = false,
  maxDisplayBytes,
  copyOnlyWhenLarge = false,
}: {
  msg?: HttpMessage;
  fill?: boolean;
  autoFormat?: boolean;
  maxDisplayBytes?: number;
  copyOnlyWhenLarge?: boolean;
}) {
  const t = useT();
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const normalized = useMemo(() => (msg ? normalizeMsg(msg) : null), [msg]);
  const rawText = useMemo(() => {
    if (!normalized) return "";
    return normalized.isBinary
      ? normalized.bodyBase64 ?? ""
      : normalized.body;
  }, [normalized]);
  const contentType = useMemo(
    () => (msg ? contentTypeOf(msg) : undefined),
    [msg],
  );
  const byteSize = useMemo(() => bodyByteSize(rawText), [rawText]);
  const displayLimit = maxDisplayBytes ?? Number.POSITIVE_INFINITY;
  const isTooLarge = byteSize > displayLimit;

  if (!msg || !normalized) {
    return <div className="p-4 text-sm text-[#888]">{t("traffic.inspector.noContent")}</div>;
  }

  if (normalized.isBinary && !normalized.bodyBase64) {
    return (
      <div className="p-4 text-sm text-[#888]">
        <TruncatedHint size={normalized.size} truncated={normalized.truncated} />
        {t("traffic.inspector.binary", { size: normalized.size })}
        <span className="mt-2 block text-[#666]">
          {t("traffic.inspector.bodyNotCached")}
        </span>
      </div>
    );
  }

  const shellClass = fill ? "flex h-full min-h-0 flex-col" : "flex max-h-96 flex-col";

  const handleCopyBody = async () => {
    await copyToClipboard(rawText);
    setCopyHint(t("traffic.inspector.bodyCopied"));
    setTimeout(() => setCopyHint(null), 2000);
  };

  if (isTooLarge && copyOnlyWhenLarge) {
    const sizeMb = (byteSize / (1024 * 1024)).toFixed(1);
    return (
      <div className={shellClass}>
        <TruncatedHint size={normalized.size} truncated={normalized.truncated} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-amber-200/90">
            {t("traffic.inspector.bodyTooLarge", { size: sizeMb })}
          </p>
          <button
            type="button"
            onClick={() => void handleCopyBody()}
            className="rounded bg-[#094771] px-4 py-1.5 text-xs text-white hover:bg-[#0e5a8a]"
          >
            {t("traffic.inspector.copyBody")}
          </button>
          {copyHint && (
            <span className="text-xs text-emerald-400">{copyHint}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <TruncatedHint size={normalized.size} truncated={normalized.truncated} />
      {normalized.isBinary && (
        <p className="shrink-0 px-4 pt-2 text-xs text-[#888]">
          {t("traffic.inspector.binary", { size: normalized.size })}
        </p>
      )}
      <BodyCodeEditor
        text={rawText}
        contentType={contentType}
        binary={normalized.isBinary}
        autoFormat={autoFormat && !isTooLarge}
      />
    </div>
  );
}
