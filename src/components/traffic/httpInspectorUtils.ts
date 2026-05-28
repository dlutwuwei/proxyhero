import type { HttpMessage, Session } from "../../types";

export function normalizeMsg(msg: HttpMessage): HttpMessage {
  const raw = msg as HttpMessage & { is_binary?: boolean; body_base64?: string };
  return {
    ...msg,
    isBinary: msg.isBinary ?? raw.is_binary ?? false,
    bodyBase64: msg.bodyBase64 ?? raw.body_base64,
  };
}

export function bodyText(msg?: HttpMessage): string {
  if (!msg) return "";
  const n = normalizeMsg(msg);
  if (n.isBinary) return n.bodyBase64 ?? "";
  return n.body;
}

export function parseUrlQuery(url: string): [string, string][] {
  try {
    const q = new URL(url).searchParams;
    return [...q.entries()];
  } catch {
    const i = url.indexOf("?");
    if (i < 0) return [];
    const params = new URLSearchParams(url.slice(i + 1));
    return [...params.entries()];
  }
}

export function parseCookieHeader(cookie?: string): [string, string][] {
  if (!cookie?.trim()) return [];
  return cookie.split(";").map((part) => {
    const eq = part.indexOf("=");
    const k = (eq >= 0 ? part.slice(0, eq) : part).trim();
    const v = eq >= 0 ? part.slice(eq + 1).trim() : "";
    return [k, v] as [string, string];
  });
}

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

export function statusLabel(status?: number): string {
  if (status == null) return "—";
  const text = STATUS_TEXT[status] ?? "";
  return text ? `${status} ${text}` : String(status);
}

export function buildRawRequest(session: Session): string {
  const msg = session.request;
  const headers = msg?.headers ?? [];
  let path = session.path || "/";
  try {
    const u = new URL(session.url);
    path = `${u.pathname}${u.search}`;
  } catch {
    /* use session.path */
  }
  const lines = [`${session.method} ${path} HTTP/1.1`];
  const hasHost = headers.some(([k]) => k.toLowerCase() === "host");
  if (!hasHost && session.host) {
    lines.push(`Host: ${session.host}`);
  }
  for (const [k, v] of headers) {
    if (k.toLowerCase() === "host" && hasHost) continue;
    lines.push(`${k}: ${v}`);
  }
  const body = bodyText(msg);
  if (body) {
    lines.push("", body);
  }
  return lines.join("\n");
}

export function buildRawResponse(session: Session): string {
  const msg = session.response;
  const status = session.status ?? 0;
  const reason = STATUS_TEXT[status] ?? "";
  const lines = [`HTTP/1.1 ${status}${reason ? ` ${reason}` : ""}`];
  for (const [k, v] of msg?.headers ?? []) {
    lines.push(`${k}: ${v}`);
  }
  const body = bodyText(msg);
  if (body) {
    lines.push("", body);
  }
  return lines.join("\n");
}

export function tryParseJson(text: string): unknown | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
