export const FORMAT_JSON_MAX = 256 * 1024;
export const RESPONSE_BODY_MAX_DISPLAY_BYTES = 2 * 1024 * 1024;
export const VIRTUAL_LINE_HEIGHT = 20;
export const RAW_VIRTUAL_LINE_HEIGHT = 20;
export const VIRTUAL_CHUNK_CHARS = 8192;
export const MONO_CHAR_WIDTH_PX = 7.2;
export const VIRTUAL_GUTTER_WIDTH_PX = 40;
export const VIRTUAL_ROW_PADDING_PX = 16;

export function estimateWrappedLineRows(
  line: string,
  containerWidth: number,
  gutter: boolean,
): number {
  const reserved =
    VIRTUAL_ROW_PADDING_PX + (gutter ? VIRTUAL_GUTTER_WIDTH_PX + 8 : 0);
  const contentWidth = Math.max(32, containerWidth - reserved);
  const charsPerRow = Math.max(
    1,
    Math.floor(contentWidth / MONO_CHAR_WIDTH_PX),
  );
  if (!line) return 1;
  return Math.max(1, Math.ceil(line.length / charsPerRow));
}

export function estimateWrappedLineHeight(
  line: string,
  containerWidth: number,
  gutter: boolean,
  lineHeight: number,
): number {
  return estimateWrappedLineRows(line, containerWidth, gutter) * lineHeight;
}

export function textByteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

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
