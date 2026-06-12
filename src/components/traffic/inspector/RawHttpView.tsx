import { useMemo, useState } from "react";
import { useT } from "../../../hooks/useT";
import { copyToClipboard } from "../../../utils/clipboard";
import { RAW_VIRTUAL_LINE_HEIGHT, textByteSize } from "./largeContent";
import { VirtualTextView } from "./VirtualTextView";

const rawLineClass =
  "mono min-w-0 w-full whitespace-pre-wrap break-all text-xs leading-5";

function RawLine({ line, isFirst }: { line: string; isFirst: boolean }) {
  if (isFirst) {
    const isStatus = line.startsWith("HTTP/");
    return (
      <div
        className={`${rawLineClass} ${
          isStatus ? "text-[#f48771]" : "text-[#d4d4d4]"
        }`}
      >
        {line || " "}
      </div>
    );
  }
  const colon = line.indexOf(":");
  if (colon > 0 && line[colon + 1] === " ") {
    return (
      <div className={rawLineClass}>
        <span className="text-[#9cdcfe]">{line.slice(0, colon + 1)}</span>
        <span className="text-[#d4d4d4]">{line.slice(colon + 1)}</span>
      </div>
    );
  }
  return (
    <div className={`${rawLineClass} text-[#d4d4d4]`}>{line || " "}</div>
  );
}

export function RawHttpView({
  text,
  maxDisplayBytes,
  copyOnlyWhenLarge = false,
}: {
  text: string;
  maxDisplayBytes?: number;
  copyOnlyWhenLarge?: boolean;
}) {
  const t = useT();
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const byteSize = useMemo(() => textByteSize(text), [text]);
  const displayLimit = maxDisplayBytes ?? Number.POSITIVE_INFINITY;
  const isTooLarge = byteSize > displayLimit;

  const handleCopy = async () => {
    await copyToClipboard(text);
    setCopyHint(t("traffic.inspector.rawCopied"));
    setTimeout(() => setCopyHint(null), 2000);
  };

  if (isTooLarge && copyOnlyWhenLarge) {
    const sizeMb = (byteSize / (1024 * 1024)).toFixed(1);
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#1e1e1e]">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-amber-200/90">
            {t("traffic.inspector.rawTooLarge", { size: sizeMb })}
          </p>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded bg-[#094771] px-4 py-1.5 text-xs text-white hover:bg-[#0e5a8a]"
          >
            {t("traffic.inspector.copyRaw")}
          </button>
          {copyHint && (
            <span className="text-xs text-emerald-400">{copyHint}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <VirtualTextView
      text={text}
      gutter
      lineHeight={RAW_VIRTUAL_LINE_HEIGHT}
      gutterClassName="mono shrink-0 select-none text-right text-[11px] leading-5 text-[#666]"
      renderLine={(line, index) => (
        <RawLine line={line} isFirst={index === 0} />
      )}
    />
  );
}
