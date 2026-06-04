function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function guessContentType(localFile: string, body: string): string {
  const ext = localFile.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "json":
      return "application/json; charset=utf-8";
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
    case "xml":
      return "application/xml; charset=utf-8";
    case "txt":
      return "text/plain; charset=utf-8";
    case "js":
    case "mjs":
      return "application/javascript; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    default:
      break;
  }

  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "application/json; charset=utf-8";
    } catch {
      /* ignore */
    }
  }
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<!doctype")) {
    return "text/html; charset=utf-8";
  }
  if (trimmed.startsWith("<?xml")) {
    return "application/xml; charset=utf-8";
  }
  if (trimmed.startsWith("<")) {
    return "text/html; charset=utf-8";
  }
  if (body.length > 0) {
    return "text/plain; charset=utf-8";
  }
  return "application/octet-stream";
}

export function detectMapLocalHeaders(input: {
  sourceMode: "file" | "body";
  localFile: string;
  localBody?: string;
}): Record<string, string> {
  const body = input.sourceMode === "body" ? (input.localBody ?? "") : "";
  const file = input.sourceMode === "file" ? input.localFile : "";
  const headers: Record<string, string> = {
    "Content-Type": guessContentType(file, body),
  };
  if (input.sourceMode === "body" && body) {
    headers["Content-Length"] = String(new TextEncoder().encode(body).length);
  }
  return headers;
}

export function mergeMapLocalHeaders(
  configured: Record<string, string>,
  detected: Record<string, string>,
): Record<string, string> {
  const out = { ...configured };
  for (const [key, value] of Object.entries(detected)) {
    if (!hasHeader(out, key)) {
      out[key] = value;
    }
  }
  return out;
}

export function headersToRows(headers: Record<string, string>): [string, string][] {
  return Object.entries(headers);
}

export function rowsToHeaders(rows: [string, string][]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of rows) {
    const k = key.trim();
    if (!k) continue;
    out[k] = value;
  }
  return out;
}
