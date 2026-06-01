import { useMemo } from "react";
import { translate } from "../i18n/messages";
import type { Session } from "../types";
import { useLocaleStore } from "../stores/localeStore";
import {
  useTrafficStore,
  type ProtocolFilter,
  type StatusFilter,
} from "../stores/trafficStore";

export interface GroupItem {
  key: string;
  label: string;
  count: number;
}

function isConnect(s: Session): boolean {
  return s.method.toUpperCase() === "CONNECT";
}

function shouldShowConnectSession(
  s: Session,
  showConnectRequests: boolean,
  searchQuery: string,
): boolean {
  if (!isConnect(s)) return true;
  if (showConnectRequests) return true;
  if (searchQuery && matchesSearch(s, searchQuery)) return true;
  return false;
}

function matchesProtocol(s: Session, filter: ProtocolFilter): boolean {
  if (filter === "all") return true;
  if (filter === "https") {
    if (isConnect(s)) return s.sslTunnel;
    return s.isHttps || s.scheme === "wss";
  }
  if (isConnect(s)) return false;
  return !s.isHttps && (s.scheme === "http" || s.scheme === "ws");
}

function matchesStatus(s: Session, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return !s.completed || s.isWebSocket === true;
  const status = s.status;
  if (status == null) return s.isWebSocket === true;
  const bucket = `${Math.floor(status / 100)}xx` as StatusFilter;
  return bucket === filter;
}

function matchesSearch(s: Session, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    s.host.toLowerCase().includes(lower) ||
    s.path.toLowerCase().includes(lower) ||
    s.url.toLowerCase().includes(lower) ||
    s.method.toLowerCase().includes(lower) ||
    (s.isWebSocket && "ws".includes(lower)) ||
    (s.isWebSocket &&
      (s.websocketMessages ?? []).some((m) =>
        m.payload.toLowerCase().includes(lower),
      )) ||
    (s.clientAddr?.toLowerCase().includes(lower) ?? false) ||
    (s.clientName?.toLowerCase().includes(lower) ?? false) ||
    (s.userAgent?.toLowerCase().includes(lower) ?? false)
  );
}

export const UNIDENTIFIED_CLIENT_KEY = "__unidentified__";

function clientGroupKey(s: Session): string {
  if (!s.userAgent?.trim()) return UNIDENTIFIED_CLIENT_KEY;
  return s.clientName || s.clientAddr || UNIDENTIFIED_CLIENT_KEY;
}

function matchesSide(
  s: Session,
  sideTab: "domains" | "apps",
  selection: string | null,
): boolean {
  if (!selection) return true;
  if (sideTab === "domains") return s.host === selection;
  return clientGroupKey(s) === selection;
}

function buildGroups(
  sessions: Session[],
  keyFn: (s: Session) => string,
  labelFn: (key: string) => string,
): GroupItem[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const key = keyFn(s);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: labelFn(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function useFilteredSessions(sessions: Session[]) {
  const locale = useLocaleStore((s) => s.locale);
  const protocolFilter = useTrafficStore((s) => s.protocolFilter);
  const statusFilter = useTrafficStore((s) => s.statusFilter);
  const sideTab = useTrafficStore((s) => s.sideTab);
  const sideSelection = useTrafficStore((s) => s.sideSelection);
  const searchText = useTrafficStore((s) => s.searchText);
  const showConnectRequests = useTrafficStore((s) => s.showConnectRequests);

  return useMemo(() => {
    const seqById = new Map<string, number>();
    sessions.forEach((s, i) => {
      seqById.set(s.id, i + 1);
    });

    const q = searchText.trim().toLowerCase();

    const listSessions = sessions.filter((s) =>
      shouldShowConnectSession(s, showConnectRequests, q),
    );

    const domainGroups = buildGroups(
      listSessions,
      (s) => s.host,
      (k) => k,
    );
    const appGroups = buildGroups(
      listSessions,
      clientGroupKey,
      (k) =>
        k === UNIDENTIFIED_CLIENT_KEY
          ? translate(locale, "traffic.unidentifiedClient")
          : k,
    );

    const filtered = listSessions.filter(
      (s) =>
        matchesSide(s, sideTab, sideSelection) &&
        (q ? true : matchesProtocol(s, protocolFilter)) &&
        matchesStatus(s, statusFilter) &&
        matchesSearch(s, q),
    );

    return { filtered, domainGroups, appGroups, seqById };
  }, [
    sessions,
    protocolFilter,
    statusFilter,
    sideTab,
    sideSelection,
    searchText,
    showConnectRequests,
    locale,
  ]);
}

export function useTrafficThroughput(sessions: Session[]) {
  return useMemo(() => {
    const now = Date.now();
    const windowMs = 1000;
    let recentBytes = 0;
    let totalBytes = 0;

    for (const s of sessions) {
      const req = s.requestSize ?? 0;
      const res = s.responseSize ?? 0;
      totalBytes += req + res;
      if (!s.completed) continue;
      const t = new Date(s.startedAt).getTime();
      if (now - t <= windowMs) {
        recentBytes += req + res;
      }
    }

    const kbPerSec = recentBytes / 1024;
    const totalMb = totalBytes / (1024 * 1024);
    return { kbPerSec, totalMb };
  }, [sessions]);
}
