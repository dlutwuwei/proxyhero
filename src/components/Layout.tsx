import type { ReactNode } from "react";
import storeLogo from "../../src-tauri/icons/StoreLogo.png";
import { useT } from "../hooks/useT";
import type { NavPage } from "../types";
import { useProxyEnabled } from "./ProxyControl";
import { NavIcon } from "./NavIcons";
import { useAppStore } from "../stores/appStore";

const NAV: {
  id: NavPage;
  labelKey: "nav.traffic" | "nav.rules" | "nav.ssl" | "nav.certificate" | "nav.settings";
}[] = [
  { id: "traffic", labelKey: "nav.traffic" },
  { id: "rules", labelKey: "nav.rules" },
  { id: "ssl", labelKey: "nav.ssl" },
  { id: "certificate", labelKey: "nav.certificate" },
  { id: "settings", labelKey: "nav.settings" },
];

function NavButton({
  page,
  label,
  active,
  onSelect,
}: {
  page: NavPage;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={`group relative flex h-10 w-full items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-[var(--ph-active)]/90 text-white"
          : "text-[var(--ph-muted)] hover:bg-[#2a2d2e] hover:text-[var(--ph-text)]"
      }`}
    >
      {active && (
        <span
          className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[var(--ph-accent)]"
          aria-hidden
        />
      )}
      <span
        className={`transition-transform ${active ? "scale-105" : "group-hover:scale-105"}`}
      >
        <NavIcon page={page} />
      </span>
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useT();
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const proxyStatus = useAppStore((s) => s.proxyStatus);
  const proxyEnabled = useProxyEnabled();
  const message = useAppStore((s) => s.message);
  const setMessage = useAppStore((s) => s.setMessage);

  const logoTitle = proxyEnabled
    ? t("nav.proxyEnabled", { port: proxyStatus.port })
    : t("nav.proxyDisabled");

  return (
    <div className="flex h-screen bg-[var(--ph-bg)] text-[var(--ph-text)]">
      <aside className="flex h-full min-h-0 w-[52px] shrink-0 flex-col border-r border-[var(--ph-border)] bg-[var(--ph-surface)]">
        <div
          className="flex h-[52px] shrink-0 items-center justify-center border-b border-[var(--ph-border)]/70"
          title={logoTitle}
        >
          <div className="relative">
            <img
              src={storeLogo}
              alt="ProxyHero"
              draggable={false}
              className={`h-7 w-7 rounded-md object-cover transition-opacity ${
                proxyEnabled ? "opacity-100" : "opacity-55"
              }`}
            />
            <span
              className={`absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border-2 border-[var(--ph-surface)] ${
                proxyEnabled ? "bg-emerald-400" : "bg-[#555]"
              }`}
              aria-hidden
            />
          </div>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-2">
          {NAV.map((item) => {
            const label = t(item.labelKey);
            return (
              <NavButton
                key={item.id}
                page={item.id}
                label={label}
                active={page === item.id}
                onSelect={() => setPage(item.id)}
              />
            );
          })}
        </nav>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {message && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-900/50 bg-amber-950/50 px-2 py-1">
            <p className="min-w-0 flex-1 truncate text-xs text-amber-200/95">
              {message}
            </p>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="shrink-0 rounded px-1 text-xs leading-none text-amber-400/80 hover:bg-amber-900/40 hover:text-amber-200"
              aria-label={t("common.closeHint")}
            >
              ×
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
