import { useState } from "react";
import { useT } from "../../../hooks/useT";

function JsonNode({
  name,
  value,
  depth,
}: {
  name?: string;
  value: unknown;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null) {
    return (
      <div className="mono pl-4 text-xs leading-5" style={{ paddingLeft: depth * 12 }}>
        {name != null && <span className="text-[#9cdcfe]">{name}: </span>}
        <span className="text-[#569cd6]">null</span>
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className="mono text-xs leading-5" style={{ paddingLeft: depth * 12 }}>
        {name != null && <span className="text-[#9cdcfe]">{name}: </span>}
        <span className="text-[#569cd6]">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div className="mono text-xs leading-5" style={{ paddingLeft: depth * 12 }}>
        {name != null && <span className="text-[#9cdcfe]">{name}: </span>}
        <span className="text-[#b5cea8]">{value}</span>
      </div>
    );
  }

  if (typeof value === "string") {
    return (
      <div
        className="mono break-all text-xs leading-5"
        style={{ paddingLeft: depth * 12 }}
      >
        {name != null && <span className="text-[#9cdcfe]">{name}: </span>}
        <span className="text-[#ce9178]">&quot;{value}&quot;</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    const label = name != null ? `${name}: ` : "";
    return (
      <div style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mono text-left text-xs text-[#d4d4d4] hover:text-white"
        >
          {open ? "▼" : "▶"} {label}[{value.length}]
        </button>
        {open &&
          value.map((item, i) => (
            <JsonNode key={i} name={String(i)} value={item} depth={depth + 1} />
          ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const label = name != null ? `${name}: ` : "";
    return (
      <div style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mono text-left text-xs text-[#d4d4d4] hover:text-white"
        >
          {open ? "▼" : "▶"} {label}
          {"{"}
          {entries.length}
          {"}"}
        </button>
        {open &&
          entries.map(([k, v]) => (
            <JsonNode key={k} name={k} value={v} depth={depth + 1} />
          ))}
      </div>
    );
  }

  return null;
}

export function JsonTreeView({ text }: { text: string }) {
  const t = useT();
  let parsed: unknown | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (parsed == null) {
    return (
      <div className="p-4 text-sm text-[#888]">
        {t("traffic.inspector.invalidJson")}
      </div>
    );
  }

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto py-2">
      <JsonNode value={parsed} depth={0} />
    </div>
  );
}
