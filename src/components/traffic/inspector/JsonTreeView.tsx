import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../../../hooks/useT";
import {
  countJsonNodes,
  TREE_PARSE_MAX,
  VIRTUAL_LINE_HEIGHT,
} from "./largeContent";

type Row =
  | {
      kind: "branch";
      id: string;
      depth: number;
      name: string;
      container: "object" | "array";
      size: number;
    }
  | {
      kind: "leaf";
      id: string;
      depth: number;
      name?: string;
      text: string;
      valueClass: string;
    };

const MAX_TREE_NODES = 50_000;

function leafText(value: unknown): { text: string; valueClass: string } {
  if (value === null) return { text: "null", valueClass: "text-[#569cd6]" };
  if (typeof value === "boolean") {
    return { text: String(value), valueClass: "text-[#569cd6]" };
  }
  if (typeof value === "number") {
    return { text: String(value), valueClass: "text-[#b5cea8]" };
  }
  if (typeof value === "string") {
    const preview =
      value.length > 200 ? `${value.slice(0, 200)}…` : value;
    return { text: `"${preview}"`, valueClass: "text-[#ce9178]" };
  }
  return { text: String(value), valueClass: "text-[#d4d4d4]" };
}

function buildRows(
  value: unknown,
  expanded: Set<string>,
  path: string,
  depth: number,
  name: string | undefined,
  rows: Row[],
): void {
  if (rows.length >= MAX_TREE_NODES) return;

  if (value === null || typeof value !== "object") {
    const { text, valueClass } = leafText(value);
    rows.push({
      kind: "leaf",
      id: path,
      depth,
      name,
      text,
      valueClass,
    });
    return;
  }

  if (Array.isArray(value)) {
    rows.push({
      kind: "branch",
      id: path,
      depth,
      name: name ?? "",
      container: "array",
      size: value.length,
    });
    if (!expanded.has(path)) return;
    value.forEach((item, i) => {
      buildRows(item, expanded, `${path}.${i}`, depth + 1, String(i), rows);
    });
    return;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  rows.push({
    kind: "branch",
    id: path,
    depth,
    name: name ?? "",
    container: "object",
    size: entries.length,
  });
  if (!expanded.has(path)) return;
  for (const [k, v] of entries) {
    if (rows.length >= MAX_TREE_NODES) break;
    buildRows(v, expanded, `${path}.${k}`, depth + 1, k, rows);
  }
}

function defaultExpanded(): Set<string> {
  return new Set(["root"]);
}

export function JsonTreeView({ text }: { text: string }) {
  const t = useT();
  const parentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);

  const parsed = useMemo(() => {
    if (!text.trim() || text.length > TREE_PARSE_MAX) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }, [text]);

  const nodeCount = useMemo(
    () => (parsed != null ? countJsonNodes(parsed) : 0),
    [parsed],
  );

  const activeExpanded = expanded ?? defaultExpanded();

  const rows = useMemo(() => {
    if (parsed == null) return [];
    const list: Row[] = [];
    buildRows(parsed, activeExpanded, "root", 0, undefined, list);
    return list;
  }, [parsed, activeExpanded]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_LINE_HEIGHT,
    overscan: 30,
  });

  if (!text.trim()) {
    return (
      <div className="p-4 text-sm text-[#888]">
        {t("traffic.inspector.noContent")}
      </div>
    );
  }

  if (text.length > TREE_PARSE_MAX) {
    return (
      <div className="p-4 text-sm text-[#888]">
        {t("traffic.inspector.treeTooLarge")}
      </div>
    );
  }

  if (parsed == null) {
    return (
      <div className="p-4 text-sm text-[#888]">
        {t("traffic.inspector.invalidJson")}
      </div>
    );
  }

  if (nodeCount > MAX_TREE_NODES) {
    return (
      <div className="p-4 text-sm text-[#888]">
        {t("traffic.inspector.treeTooManyNodes", { count: nodeCount })}
      </div>
    );
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev ?? activeExpanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      ref={parentRef}
      className="scroll-thin min-h-0 flex-1 overflow-auto py-2"
    >
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          return (
            <div
              key={row.id + vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
                height: `${vi.size}px`,
              }}
            >
              {row.kind === "branch" ? (
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="mono w-full truncate text-left text-xs text-[#d4d4d4] hover:text-white"
                  style={{ paddingLeft: row.depth * 12 + 8 }}
                >
                  {activeExpanded.has(row.id) ? "▼" : "▶"}{" "}
                  {row.name ? (
                    <span className="text-[#9cdcfe]">{row.name}: </span>
                  ) : null}
                  {row.container === "array" ? `[${row.size}]` : `{${row.size}}`}
                </button>
              ) : (
                <div
                  className="mono truncate text-xs leading-5"
                  style={{ paddingLeft: row.depth * 12 + 8 }}
                  title={row.text}
                >
                  {row.name != null && (
                    <span className="text-[#9cdcfe]">{row.name}: </span>
                  )}
                  <span className={row.valueClass}>{row.text}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
