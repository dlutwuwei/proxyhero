import { create } from "zustand";

export type ProtocolFilter = "all" | "http" | "https" | "websocket";
export type StatusFilter =
  | "all"
  | "1xx"
  | "2xx"
  | "3xx"
  | "4xx"
  | "5xx"
  | "active";
export type SideTab = "domains" | "apps";

const INSPECTOR_HEIGHT_KEY = "proxyhero-inspector-height";
const SIDEBAR_WIDTH_KEY = "proxyhero-sidebar-width";
const FAVORITE_DOMAINS_KEY = "proxyhero-favorite-domains";
const FAVORITE_CLIENTS_KEY = "proxyhero-favorite-clients";
const SHOW_CONNECT_KEY = "proxyhero-show-connect";
const DEFAULT_INSPECTOR_HEIGHT = 280;
const DEFAULT_SIDEBAR_WIDTH = 208;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 480;

function loadStringList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((x) => typeof x === "string")
      ) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveStringList(key: string, values: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    /* ignore */
  }
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

function loadInspectorHeight(): number {
  try {
    const v = localStorage.getItem(INSPECTOR_HEIGHT_KEY);
    if (v) {
      const n = Number(v);
      if (n >= 120 && n <= 600) return n;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_INSPECTOR_HEIGHT;
}

function loadSidebarWidth(): number {
  try {
    const v = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (v) {
      const n = Number(v);
      if (n >= MIN_SIDEBAR_WIDTH && n <= MAX_SIDEBAR_WIDTH) return n;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

interface TrafficStore {
  protocolFilter: ProtocolFilter;
  statusFilter: StatusFilter;
  sideTab: SideTab;
  sideSelection: string | null;
  searchText: string;
  autoSelect: boolean;
  showConnectRequests: boolean;
  inspectorHeight: number;
  sidebarWidth: number;
  favoriteDomains: string[];
  favoriteClients: string[];
  setProtocolFilter: (f: ProtocolFilter) => void;
  setStatusFilter: (f: StatusFilter) => void;
  setSideTab: (t: SideTab) => void;
  setSideSelection: (s: string | null) => void;
  setSearchText: (t: string) => void;
  setAutoSelect: (v: boolean) => void;
  setShowConnectRequests: (v: boolean) => void;
  setInspectorHeight: (h: number) => void;
  setSidebarWidth: (w: number) => void;
  toggleFavoriteDomain: (host: string) => void;
  isFavoriteDomain: (host: string) => boolean;
  toggleFavoriteClient: (client: string) => void;
  isFavoriteClient: (client: string) => boolean;
}

export const useTrafficStore = create<TrafficStore>((set, get) => ({
  protocolFilter: "all",
  statusFilter: "all",
  sideTab: "domains",
  sideSelection: null,
  searchText: "",
  autoSelect: false,
  showConnectRequests: loadBool(SHOW_CONNECT_KEY, false),
  inspectorHeight: loadInspectorHeight(),
  sidebarWidth: loadSidebarWidth(),
  favoriteDomains: loadStringList(FAVORITE_DOMAINS_KEY),
  favoriteClients: loadStringList(FAVORITE_CLIENTS_KEY),
  setProtocolFilter: (f) => set({ protocolFilter: f }),
  setStatusFilter: (f) => set({ statusFilter: f }),
  setSideTab: (t) => set({ sideTab: t, sideSelection: null }),
  setSideSelection: (s) => set({ sideSelection: s }),
  setSearchText: (t) => set({ searchText: t }),
  setAutoSelect: (v) => set({ autoSelect: v }),
  setShowConnectRequests: (v) => {
    try {
      localStorage.setItem(SHOW_CONNECT_KEY, String(v));
    } catch {
      /* ignore */
    }
    set({ showConnectRequests: v });
  },
  setInspectorHeight: (h) => {
    const clamped = Math.min(600, Math.max(120, h));
    try {
      localStorage.setItem(INSPECTOR_HEIGHT_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    set({ inspectorHeight: clamped });
  },
  setSidebarWidth: (w) => {
    const clamped = Math.min(
      MAX_SIDEBAR_WIDTH,
      Math.max(MIN_SIDEBAR_WIDTH, w),
    );
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    set({ sidebarWidth: clamped });
  },
  toggleFavoriteDomain: (host) => {
    const trimmed = host.trim();
    if (!trimmed) return;
    set((state) => {
      const favoriteDomains = toggleInList(state.favoriteDomains, trimmed);
      saveStringList(FAVORITE_DOMAINS_KEY, favoriteDomains);
      return { favoriteDomains };
    });
  },
  isFavoriteDomain: (host) => {
    const trimmed = host.trim();
    return get().favoriteDomains.includes(trimmed);
  },
  toggleFavoriteClient: (client) => {
    const trimmed = client.trim();
    if (!trimmed) return;
    set((state) => {
      const favoriteClients = toggleInList(state.favoriteClients, trimmed);
      saveStringList(FAVORITE_CLIENTS_KEY, favoriteClients);
      return { favoriteClients };
    });
  },
  isFavoriteClient: (client) => {
    const trimmed = client.trim();
    return get().favoriteClients.includes(trimmed);
  },
}));
