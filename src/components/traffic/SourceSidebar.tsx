import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { GroupItem } from "../../hooks/useFilteredSessions";
import { useT } from "../../hooks/useT";
import { useTrafficStore, type SideTab } from "../../stores/trafficStore";

type FavoriteKind = "domain" | "client";

type ContextMenuState = {
  x: number;
  y: number;
  kind: FavoriteKind;
  key: string;
  label: string;
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 shrink-0 ${filled ? "fill-amber-400 text-amber-400" : "fill-none text-[#666] hover:text-[#aaa]"}`}
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        d="M12 3.5l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 3.5z"
      />
    </svg>
  );
}

function GroupRow({
  item,
  selected,
  favorited,
  onSelect,
  onToggleFavorite,
  onContextMenu,
  unfavoriteTitle,
  favoriteTitle,
}: {
  item: GroupItem;
  selected: boolean;
  favorited: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onContextMenu: (e: MouseEvent) => void;
  unfavoriteTitle: string;
  favoriteTitle: string;
}) {
  return (
    <div
      className={`group flex w-full items-center gap-0.5 hover:bg-[#2a2d2e] ${
        selected ? "bg-[#094771]/50" : ""
      }`}
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        title={favorited ? unfavoriteTitle : favoriteTitle}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="shrink-0 px-1.5 py-1"
      >
        <StarIcon filled={favorited} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center justify-between gap-1 py-1 pr-3 pl-0 text-left text-xs text-[#ccc] data-[selected]:text-white"
        data-selected={selected || undefined}
        title={item.label}
      >
        <span className={`min-w-0 truncate ${selected ? "text-white" : ""}`}>
          {item.label}
        </span>
        <span className="shrink-0 rounded bg-[#333] px-1.5 text-[10px] text-[#888]">
          {item.count}
        </span>
      </button>
    </div>
  );
}

function FavoriteSection({
  title,
  items,
  sideTab,
  sideSelection,
  kind,
  onSelect,
  onToggleFavorite,
  onContextMenu,
  unfavoriteTitle,
  favoriteTitle,
}: {
  title: string;
  items: GroupItem[];
  sideTab: SideTab;
  sideSelection: string | null;
  kind: FavoriteKind;
  onSelect: (key: string) => void;
  onToggleFavorite: (key: string) => void;
  onContextMenu: (e: MouseEvent, item: GroupItem, kind: FavoriteKind) => void;
  unfavoriteTitle: string;
  favoriteTitle: string;
}) {
  if (items.length === 0) return null;
  const tabForKind = kind === "domain" ? "domains" : "apps";
  return (
    <div className="pb-1">
      <div className="px-3 py-0.5 text-[10px] text-[#555]">{title}</div>
      {items.map((item) => (
        <GroupRow
          key={item.key}
          item={item}
          selected={sideTab === tabForKind && sideSelection === item.key}
          favorited
          onSelect={() => onSelect(item.key)}
          onToggleFavorite={() => onToggleFavorite(item.key)}
          onContextMenu={(e) => onContextMenu(e, item, kind)}
          unfavoriteTitle={unfavoriteTitle}
          favoriteTitle={favoriteTitle}
        />
      ))}
    </div>
  );
}

function SidebarContextMenu({
  menu,
  favorited,
  onToggle,
  onClose,
  favoriteLabel,
  unfavoriteLabel,
}: {
  menu: ContextMenuState;
  favorited: boolean;
  onToggle: () => void;
  onClose: () => void;
  favoriteLabel: string;
  unfavoriteLabel: string;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="fixed min-w-[140px] rounded border border-[#444] bg-[#2d2d2d] py-1 shadow-lg"
        style={{ left: menu.x, top: menu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="block w-full px-3 py-1.5 text-left text-xs text-[#ccc] hover:bg-[#094771]"
          onClick={() => {
            onToggle();
            onClose();
          }}
        >
          {favorited ? unfavoriteLabel : favoriteLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function SourceSidebar({
  domainGroups,
  appGroups,
}: {
  domainGroups: GroupItem[];
  appGroups: GroupItem[];
}) {
  const t = useT();
  const sideTab = useTrafficStore((s) => s.sideTab);
  const sideSelection = useTrafficStore((s) => s.sideSelection);
  const favoriteDomains = useTrafficStore((s) => s.favoriteDomains);
  const favoriteClients = useTrafficStore((s) => s.favoriteClients);
  const setSideTab = useTrafficStore((s) => s.setSideTab);
  const setSideSelection = useTrafficStore((s) => s.setSideSelection);
  const toggleFavoriteDomain = useTrafficStore((s) => s.toggleFavoriteDomain);
  const toggleFavoriteClient = useTrafficStore((s) => s.toggleFavoriteClient);
  const isFavoriteDomain = useTrafficStore((s) => s.isFavoriteDomain);
  const isFavoriteClient = useTrafficStore((s) => s.isFavoriteClient);

  const sidebarWidth = useTrafficStore((s) => s.sidebarWidth);
  const setSidebarWidth = useTrafficStore((s) => s.setSidebarWidth);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onResizePointerDown = useCallback(
    (e: PointerEvent) => {
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = sidebarWidth;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [sidebarWidth],
  );

  const onResizePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      setSidebarWidth(startW.current + delta);
    },
    [setSidebarWidth],
  );

  const onResizePointerUp = useCallback((e: PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const groups = sideTab === "domains" ? domainGroups : appGroups;

  const countByHost = useMemo(
    () => new Map(domainGroups.map((g) => [g.key, g.count])),
    [domainGroups],
  );
  const countByClient = useMemo(
    () => new Map(appGroups.map((g) => [g.key, g.count])),
    [appGroups],
  );

  const favoriteDomainItems = useMemo(
    () =>
      favoriteDomains.map((host) => ({
        key: host,
        label: host,
        count: countByHost.get(host) ?? 0,
      })),
    [favoriteDomains, countByHost],
  );

  const favoriteClientItems = useMemo(
    () =>
      favoriteClients.map((client) => ({
        key: client,
        label: client,
        count: countByClient.get(client) ?? 0,
      })),
    [favoriteClients, countByClient],
  );

  const hasFavorites =
    favoriteDomainItems.length > 0 || favoriteClientItems.length > 0;

  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextMenu]);

  const openContextMenu = (
    e: MouseEvent,
    item: GroupItem,
    kind: FavoriteKind,
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      kind,
      key: item.key,
      label: item.label,
    });
  };

  const selectDomain = (host: string | null) => {
    if (sideTab !== "domains") setSideTab("domains");
    setSideSelection(host);
  };

  const selectClient = (client: string | null) => {
    if (sideTab !== "apps") setSideTab("apps");
    setSideSelection(client);
  };

  const contextFavorited =
    contextMenu?.kind === "domain"
      ? isFavoriteDomain(contextMenu.key)
      : contextMenu
        ? isFavoriteClient(contextMenu.key)
        : false;

  const toggleContextFavorite = () => {
    if (!contextMenu) return;
    if (contextMenu.kind === "domain") {
      toggleFavoriteDomain(contextMenu.key);
    } else {
      toggleFavoriteClient(contextMenu.key);
    }
  };

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-[#333] bg-[#252526]"
      style={{ width: sidebarWidth }}
    >
      <div className="flex shrink-0 border-b border-[#333] text-xs">
        <button
          type="button"
          onClick={() => setSideTab("domains")}
          className={`flex-1 px-2 py-2 ${
            sideTab === "domains"
              ? "border-b-2 border-[#3794ff] text-white"
              : "text-[#888] hover:text-[#ccc]"
          }`}
        >
          {t("traffic.sidebar.domains")}
        </button>
        <button
          type="button"
          onClick={() => setSideTab("apps")}
          className={`flex-1 px-2 py-2 ${
            sideTab === "apps"
              ? "border-b-2 border-[#3794ff] text-white"
              : "text-[#888] hover:text-[#ccc]"
          }`}
        >
          {t("traffic.sidebar.clients")}
        </button>
      </div>

      <section className="shrink-0 border-b border-[#333]">
        <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-[#666]">
          {t("traffic.sidebar.favorites")}
        </div>
        {!hasFavorites ? (
          <p className="px-3 pb-2 text-[11px] leading-relaxed text-[#555]">
            {t("traffic.sidebar.favHint")}
          </p>
        ) : (
          <div className="scroll-thin max-h-36 overflow-auto">
            <FavoriteSection
              title={t("traffic.sidebar.domains")}
              items={favoriteDomainItems}
              sideTab={sideTab}
              sideSelection={sideSelection}
              kind="domain"
              onSelect={(key) => selectDomain(key)}
              onToggleFavorite={toggleFavoriteDomain}
              onContextMenu={openContextMenu}
              unfavoriteTitle={t("traffic.sidebar.unfavorite")}
              favoriteTitle={t("traffic.sidebar.favorite")}
            />
            <FavoriteSection
              title={t("traffic.sidebar.clients")}
              items={favoriteClientItems}
              sideTab={sideTab}
              sideSelection={sideSelection}
              kind="client"
              onSelect={(key) => selectClient(key)}
              onToggleFavorite={toggleFavoriteClient}
              onContextMenu={openContextMenu}
              unfavoriteTitle={t("traffic.sidebar.unfavorite")}
              favoriteTitle={t("traffic.sidebar.favorite")}
            />
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setSideSelection(null)}
        className={`flex shrink-0 items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-[#2a2d2e] ${
          sideSelection === null ? "bg-[#094771]/50 text-white" : "text-[#ccc]"
        }`}
      >
        <span>{t("common.all")}</span>
      </button>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto py-1">
        {groups.map((g) => {
          const isDomain = sideTab === "domains";
          return (
            <GroupRow
              key={g.key}
              item={g}
              selected={sideSelection === g.key}
              favorited={
                isDomain ? isFavoriteDomain(g.key) : isFavoriteClient(g.key)
              }
              onSelect={() => setSideSelection(g.key)}
              onToggleFavorite={() =>
                isDomain
                  ? toggleFavoriteDomain(g.key)
                  : toggleFavoriteClient(g.key)
              }
              onContextMenu={(e) =>
                openContextMenu(e, g, isDomain ? "domain" : "client")
              }
              unfavoriteTitle={t("traffic.sidebar.unfavorite")}
              favoriteTitle={t("traffic.sidebar.favorite")}
            />
          );
        })}
        {groups.length === 0 && (
          <p className="px-3 py-4 text-center text-[11px] text-[#666]">
            {t("traffic.sidebar.noData")}
          </p>
        )}
      </div>

      {contextMenu && (
        <SidebarContextMenu
          menu={contextMenu}
          favorited={contextFavorited}
          onToggle={toggleContextFavorite}
          onClose={() => setContextMenu(null)}
          favoriteLabel={
            contextMenu.kind === "domain"
              ? t("traffic.sidebar.favoriteDomain")
              : t("traffic.sidebar.favoriteClient")
          }
          unfavoriteLabel={
            contextMenu.kind === "domain"
              ? t("traffic.sidebar.unfavoriteDomain")
              : t("traffic.sidebar.unfavoriteClient")
          }
        />
      )}

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={sidebarWidth}
        className="absolute top-0 right-0 z-10 flex h-full w-1.5 cursor-col-resize items-center justify-center hover:bg-[#3794ff]/30"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
      >
        <div className="h-8 w-0.5 rounded bg-[#555]" />
      </div>
    </aside>
  );
}
