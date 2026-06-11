import type { MapLocalRule, MapRemoteRule, Session } from "../../types";
import { bodyText } from "../traffic/httpInspectorUtils";

const SKIP_RESPONSE_HEADERS = new Set([
  "transfer-encoding",
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-connection",
]);

export function newRemoteRule(): MapRemoteRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    name: "新规则",
    order: 0,
    matchRule: {
      protocol: "https",
      host: "api.example.com",
      path: "",
    },
    mapTo: {
      protocol: "http",
      host: "127.0.0.1",
      port: 8080,
      preservePath: true,
      preserveQuery: true,
    },
  };
}

export function newLocalRule(): MapLocalRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    name: "本地 Mock",
    order: 0,
    matchRule: { host: "api.example.com", path: "/user/info" },
    localFile: "",
    status: 200,
    autoHeaders: true,
    headers: {},
  };
}

export function formatMapTarget(
  protocol: string,
  host: string,
  port: number,
): string {
  return `${protocol}://${host}:${port}`;
}

function matchProtocolFromSession(session: Session): string {
  return session.scheme === "http" ? "http" : "https";
}

function matchPathFromSession(session: Session): string | undefined {
  const path = session.path?.trim() ?? "";
  if (!path || path === "/") return undefined;
  return path;
}

function responseHeadersFromSession(session: Session): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of session.response?.headers ?? []) {
    if (SKIP_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function remoteRuleFromSession(
  session: Session,
  order = 0,
): MapRemoteRule {
  const path = matchPathFromSession(session);
  const name = `${session.host}${path ?? ""}`.slice(0, 64);
  return {
    ...newRemoteRule(),
    name,
    order,
    matchRule: {
      protocol: matchProtocolFromSession(session),
      host: session.host,
      path,
    },
  };
}

function syncContentLength(
  headers: Record<string, string>,
  localBody: string,
): Record<string, string> {
  const out = { ...headers };
  for (const k of Object.keys(out)) {
    if (k.toLowerCase() === "content-length") delete out[k];
  }
  if (localBody) {
    out["Content-Length"] = String(new TextEncoder().encode(localBody).length);
  }
  return out;
}

export function localRuleFromSession(
  session: Session,
  order = 0,
): MapLocalRule {
  const path = matchPathFromSession(session);
  const name = `${session.host}${path ?? ""}`.slice(0, 64);
  const localBody = session.response ? bodyText(session.response) : "";
  const rawHeaders = responseHeadersFromSession(session);
  const hasHeaders = Object.keys(rawHeaders).length > 0;
  const headers = hasHeaders
    ? syncContentLength(rawHeaders, localBody)
    : {};

  return {
    ...newLocalRule(),
    name,
    order,
    status: session.status ?? 200,
    localFile: "",
    localBody,
    autoHeaders: !hasHeaders,
    headers: hasHeaders ? headers : {},
    matchRule: {
      host: session.host,
      path,
    },
  };
}
