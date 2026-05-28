import type { ReactNode } from "react";
import { useT } from "../../hooks/useT";
import {
  useTrafficStore,
  type ProtocolFilter,
  type StatusFilter,
} from "../../stores/trafficStore";
import { ProxyToggleButton, useProxyEnabled } from "../ProxyControl";
import { useAppStore } from "../../stores/appStore";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-[11px] ${
        active
          ? "bg-[#094771] text-white"
          : "bg-[#333] text-[#aaa] hover:bg-[#444]"
      }`}
    >
      {children}
    </button>
  );
}

export function TrafficToolbar() {
  const t = useT();
  const proxyStatus = useAppStore((s) => s.proxyStatus);
  const clearSessions = useAppStore((s) => s.clearSessions);
  const proxyEnabled = useProxyEnabled();
  const protocolFilter = useTrafficStore((s) => s.protocolFilter);
  const statusFilter = useTrafficStore((s) => s.statusFilter);
  const searchText = useTrafficStore((s) => s.searchText);
  const setProtocolFilter = useTrafficStore((s) => s.setProtocolFilter);
  const setStatusFilter = useTrafficStore((s) => s.setStatusFilter);
  const setSearchText = useTrafficStore((s) => s.setSearchText);

  const protocols: { id: ProtocolFilter; label: string }[] = [
    { id: "all", label: t("common.all") },
    { id: "http", label: "HTTP" },
    { id: "https", label: "HTTPS" },
  ];

  const statuses: { id: StatusFilter; label: string }[] = [
    { id: "all", label: t("common.all") },
    { id: "active", label: t("traffic.filter.active") },
    { id: "2xx", label: "2xx" },
    { id: "4xx", label: "4xx" },
    { id: "5xx", label: "5xx" },
  ];

  const listenLabel = proxyStatus.lanIp
    ? `${proxyStatus.lanIp}:${proxyStatus.port}`
    : `:${proxyStatus.port}`;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-[#333] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`mono text-sm font-medium ${
            proxyEnabled ? "text-emerald-400" : "text-[#888]"
          }`}
        >
          {proxyEnabled ? "●" : "○"} {listenLabel}
        </span>
        <ProxyToggleButton />
        <button
          type="button"
          onClick={() => clearSessions()}
          className="rounded bg-[#333] px-3 py-1 text-xs text-[#ccc] hover:bg-[#444]"
        >
          {t("traffic.clearAll")}
        </button>
        <input
          className="ml-auto w-56 rounded border border-[#444] bg-[#2d2d2d] px-2 py-1 text-xs"
          placeholder={t("traffic.searchPlaceholder")}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {protocols.map((p) => (
          <Chip
            key={p.id}
            active={protocolFilter === p.id}
            onClick={() => setProtocolFilter(p.id)}
          >
            {p.label}
          </Chip>
        ))}
        <span className="mx-1 text-[#444]">|</span>
        {statuses.map((s) => (
          <Chip
            key={s.id}
            active={statusFilter === s.id}
            onClick={() => setStatusFilter(s.id)}
          >
            {s.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
