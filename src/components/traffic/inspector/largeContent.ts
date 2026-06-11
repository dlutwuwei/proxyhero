export const FORMAT_JSON_MAX = 256 * 1024;
export const BODY_LOAD_WARN_BYTES = 5 * 1024 * 1024;
export const TREE_PARSE_MAX = 4 * 1024 * 1024;
export const VIRTUAL_LINE_HEIGHT = 20;
export const VIRTUAL_CHUNK_CHARS = 8192;

export function formatBodyText(
  raw: string,
  options?: { auto?: boolean; contentType?: string },
): string {
  if (!isLikelyJson(raw, options?.contentType)) return raw;
  if (!options?.auto && raw.length > FORMAT_JSON_MAX) return raw;
  return tryFormatJson(raw) ?? raw;
}

export function tryFormatJson(raw: string): string | null {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return null;
  }
}

export function isLikelyJson(raw: string, contentType?: string): boolean {
  if (contentType?.toLowerCase().includes("json")) return true;
  const trimmed = raw.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function splitVirtualLines(text: string): string[] {
  if (!text) return [""];
  const lines = text.split("\n");
  if (lines.length > 1 || text.length <= VIRTUAL_CHUNK_CHARS) return lines;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += VIRTUAL_CHUNK_CHARS) {
    chunks.push(text.slice(i, i + VIRTUAL_CHUNK_CHARS));
  }
  return chunks;
}

export function countJsonNodes(value: unknown, limit = 50_000): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (n > limit) return;
    if (v === null || typeof v !== "object") {
      n += 1;
      return;
    }
    if (Array.isArray(v)) {
      n += 1;
      for (const item of v) walk(item);
      return;
    }
    n += 1;
    for (const val of Object.values(v as Record<string, unknown>)) walk(val);
  };
  walk(value);
  return n;
}
