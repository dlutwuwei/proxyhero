import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../../../hooks/useT";
import { VIRTUAL_LINE_HEIGHT } from "./largeContent";

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
    }
  | {
      kind: "loadMore";
      id: string;
      depth: number;
      path: string;
      remaining: number;
    };

const INITIAL_CHILD_BATCH = 64;
const LOAD_MORE_BATCH = 128;

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

function childLimit(path: string, loadedCounts: Map<string, number>): number {
  return loadedCounts.get(path) ?? INITIAL_CHILD_BATCH;
}

function buildRows(
  value: unknown,
  expanded: Set<string>,
  loadedCounts: Map<string, number>,
  path: string,
  depth: number,
  name: string | undefined,
  rows: Row[],
): void {
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
    const limit = childLimit(path, loadedCounts);
    const count = Math.min(value.length, limit);
    for (let i = 0; i < count; i++) {
      buildRows(
        value[i],
        expanded,
        loadedCounts,
        `${path}.${i}`,
        depth + 1,
        String(i),
        rows,
      );
    }
    if (count < value.length) {
      rows.push({
        kind: "loadMore",
        id: `${path}.__load_more__`,
        depth: depth + 1,
        path,
        remaining: value.length - count,
      });
    }
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
  const limit = childLimit(path, loadedCounts);
  const count = Math.min(entries.length, limit);
  for (let i = 0; i < count; i++) {
    const [k, v] = entries[i];
    buildRows(v, expanded, loadedCounts, `${path}.${k}`, depth + 1, k, rows);
  }
  if (count < entries.length) {
    rows.push({
      kind: "loadMore",
      id: `${path}.__load_more__`,
      depth: depth + 1,
      path,
      remaining: entries.length - count,
    });
  }
}

function defaultExpanded(): Set<string> {
  return new Set(["root"]);
}

type ParseState = "idle" | "loading" | "ok" | "error";

export function JsonTreeView({ text }: { text: string }) {
  const t = useT();
  const parentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [loadedCounts, setLoadedCounts] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [parseState, setParseState] = useState<ParseState>("idle");
  const [parsed, setParsed] = useState<unknown>(null);

  useEffect(() => {
    if (!text.trim()) {
      setParseState("idle");
      setParsed(null);
      return;
    }
    setParseState("loading");
    setParsed(null);
    setExpanded(null);
    setLoadedCounts(new Map());
    let cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        const value = JSON.parse(text) as unknown;
        if (!cancelled) {
          setParsed(value);
          setParseState("ok");
        }
      } catch {
        if (!cancelled) {
          setParsed(null);
          setParseState("error");
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text]);

  const activeExpanded = expanded ?? defaultExpanded();

  const rows = useMemo(() => {
    if (parseState !== "ok" || parsed == null) return [];
    const list: Row[] = [];
    buildRows(parsed, activeExpanded, loadedCounts, "root", 0, undefined, list);
    return list;
  }, [parsed, activeExpanded, loadedCounts, parseState]);

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

  if (parseState === "loading") {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#888]">
        {t("traffic.inspector.treeParsing")}
      </div>
    );
  }

  if (parseState === "error" || parsed == null) {
    return (
      <div className="p-4 text-sm text-[#888]">
        {t("traffic.inspector.invalidJson")}
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

  const loadMore = (path: string) => {
    setLoadedCounts((prev) => {
      const next = new Map(prev);
      const current = next.get(path) ?? INITIAL_CHILD_BATCH;
      next.set(path, current + LOAD_MORE_BATCH);
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
              ) : row.kind === "loadMore" ? (
                <button
                  type="button"
                  onClick={() => loadMore(row.path)}
                  className="mono w-full truncate text-left text-xs text-[#3794ff] hover:text-[#6cb6ff]"
                  style={{ paddingLeft: row.depth * 12 + 8 }}
                >
                  {t("traffic.inspector.treeLoadMore", {
                    remaining: row.remaining,
                  })}
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
