import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import type { Extension } from "@codemirror/state";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../hooks/useT";
import {
  formatBodyText,
  isLikelyJson,
  tryFormatJson,
} from "./largeContent";
import { bodyEditorReadOnly, bodyEditorTheme } from "./bodyEditorTheme";

function languageExtension(
  contentType: string | undefined,
  text: string,
): Extension[] {
  const ct = contentType?.toLowerCase() ?? "";
  if (ct.includes("json") || isLikelyJson(text, contentType)) return [json()];
  if (ct.includes("html")) return [html()];
  if (ct.includes("xml")) return [xml()];
  if (ct.includes("javascript") || ct.includes("ecmascript")) {
    return [javascript()];
  }
  if (isLikelyJson(text)) return [json()];
  return [];
}

function languageLabel(
  contentType: string | undefined,
  text: string,
): string {
  const ct = contentType?.toLowerCase() ?? "";
  if (ct.includes("json") || isLikelyJson(text, contentType)) return "JSON";
  if (ct.includes("html")) return "HTML";
  if (ct.includes("xml")) return "XML";
  if (ct.includes("javascript")) return "JavaScript";
  if (isLikelyJson(text)) return "JSON";
  return "Plain Text";
}

export function BodyCodeEditor({
  text,
  contentType,
  binary,
  autoFormat = false,
}: {
  text: string;
  contentType?: string;
  binary?: boolean;
  autoFormat?: boolean;
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(240);
  const formatInitial = useCallback(
    (raw: string) =>
      binary ? raw : formatBodyText(raw, { auto: autoFormat, contentType }),
    [binary, autoFormat, contentType],
  );
  const [value, setValue] = useState(() => formatInitial(text));
  const [formatError, setFormatError] = useState<string | null>(null);

  useEffect(() => {
    setValue(formatInitial(text));
    setFormatError(null);
  }, [text, formatInitial]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => setHeight(Math.max(120, el.clientHeight));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const extensions = useMemo(
    () =>
      binary
        ? [bodyEditorTheme, bodyEditorReadOnly]
        : [
            bodyEditorTheme,
            bodyEditorReadOnly,
            ...languageExtension(contentType, value),
          ],
    [binary, contentType, value],
  );

  const canFormat = !binary && isLikelyJson(text, contentType);

  const handleFormat = useCallback(() => {
    const formatted = tryFormatJson(value);
    if (formatted == null) {
      setFormatError(t("traffic.inspector.formatFailed"));
      return;
    }
    setFormatError(null);
    setValue(formatted);
  }, [value, t]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#333] bg-[#252526] px-2 py-1">
        <span className="text-[11px] text-[#666]">
          {binary ? "Base64" : languageLabel(contentType, text)}
        </span>
        {canFormat && (
          <button
            type="button"
            onClick={handleFormat}
            className="rounded bg-[#333] px-2 py-0.5 text-[11px] text-[#ccc] hover:bg-[#444]"
          >
            {t("traffic.inspector.formatBody")}
          </button>
        )}
        {formatError && (
          <span className="text-[11px] text-amber-300">{formatError}</span>
        )}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          value={value || "(empty)"}
          height={`${height}px`}
          theme={vscodeDark}
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: false,
            autocompletion: false,
            bracketMatching: true,
            closeBrackets: false,
            indentOnInput: false,
          }}
          editable={false}
        />
      </div>
    </div>
  );
}
