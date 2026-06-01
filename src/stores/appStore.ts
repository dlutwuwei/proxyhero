import { create } from "zustand";
import { api, onSessionEvent, onSessionResync } from "../api/tauri";
import { useTrafficStore } from "./trafficStore";
import type {
  AppConfig,
  AppRules,
  CertInfo,
  NavPage,
  ProxyStatus,
  Session,
} from "../types";

function normalizeSession(raw: Session & Record<string, unknown>): Session {
  const s = { ...raw };
  if (s.isWebSocket == null && typeof raw.isWebsocket === "boolean") {
    s.isWebSocket = raw.isWebsocket;
  }
  if (s.websocketMessages == null && Array.isArray(raw.websocketMessages)) {
    s.websocketMessages = raw.websocketMessages as Session["websocketMessages"];
  }
  return s;
}

function mergeSession(prev: Session | undefined, incoming: Session): Session {
  if (!prev) return incoming;
  const prevMsgs = prev.websocketMessages ?? [];
  const nextMsgs = incoming.websocketMessages ?? [];
  const websocketMessages =
    nextMsgs.length >= prevMsgs.length ? nextMsgs : prevMsgs;
  return { ...incoming, websocketMessages };
}

interface AppStore {
  page: NavPage;
  setPage: (p: NavPage) => void;
  proxyStatus: ProxyStatus;
  sessions: Session[];
  selectedId: string | null;
  capturePaused: boolean;
  rules: AppRules | null;
  config: AppConfig | null;
  certInfo: CertInfo | null;
  message: string | null;
  setMessage: (m: string | null) => void;
  selectSession: (id: string | null) => void;
  refreshStatus: () => Promise<void>;
  toggleProxy: () => Promise<void>;
  clearSessions: () => Promise<void>;
  clearSession: (id: string) => Promise<void>;
  loadRules: () => Promise<void>;
  loadConfig: () => Promise<void>;
  loadCert: () => Promise<void>;
  reloadSessions: () => Promise<void>;
  upsertSession: (session: Session, eventType?: string) => void;
  init: () => Promise<() => void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  page: "traffic",
  setPage: (p) => set({ page: p }),
  proxyStatus: { running: false, port: 8888, sessionCount: 0 },
  sessions: [],
  selectedId: null,
  capturePaused: false,
  rules: null,
  config: null,
  certInfo: null,
  message: null,
  setMessage: (m) => set({ message: m }),
  selectSession: (id) => set({ selectedId: id }),

  refreshStatus: async () => {
    const proxyStatus = await api.getProxyStatus();
    set({ proxyStatus });
  },

  toggleProxy: async () => {
    const { proxyStatus, config } = get();
    const enabled =
      proxyStatus.running && (config?.systemProxyEnabled ?? false);
    try {
      if (enabled) {
        await api.setSystemProxy(false);
        await api.stopProxy();
      } else {
        await api.ensureCa();
        await api.startProxy();
        await api.setSystemProxy(true);
      }
      await Promise.all([get().refreshStatus(), get().loadConfig()]);
    } catch (e) {
      set({ message: String(e) });
      await Promise.all([get().refreshStatus(), get().loadConfig()]);
    }
  },

  clearSessions: async () => {
    await api.clearSessions();
    set({ sessions: [], selectedId: null });
    await get().refreshStatus();
  },

  clearSession: async (id) => {
    await api.clearSession(id);
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
    await get().refreshStatus();
  },

  loadRules: async () => {
    const rules = await api.getRules();
    set({ rules });
  },

  loadConfig: async () => {
    const config = await api.getConfig();
    set({ config });
  },

  loadCert: async () => {
    const certInfo = await api.getCertInfo();
    set({ certInfo });
  },

  reloadSessions: async () => {
    const sessions = (await api.listSessions()).map((s) =>
      normalizeSession(s as Session & Record<string, unknown>),
    );
    set({ sessions });
  },

  upsertSession: (session, eventType?: string) => {
    session = normalizeSession(session as Session & Record<string, unknown>);
    const isNew = get().sessions.every((x) => x.id !== session.id);
    if (session.isWebSocket) {
      const prev = get().sessions.find((x) => x.id === session.id);
      const prevCount = prev?.websocketMessages?.length ?? 0;
      const nextCount = session.websocketMessages?.length ?? 0;
      console.info("[proxyhero] ws upsert", {
        event: eventType,
        id: session.id,
        prevCount,
        nextCount,
        completed: session.completed,
        lastOpcode: session.websocketMessages?.at(-1)?.opcode,
        lastPayloadLen: session.websocketMessages?.at(-1)?.payload.length ?? 0,
      });
    }
    set((s) => {
      const idx = s.sessions.findIndex((x) => x.id === session.id);
      const merged =
        idx >= 0 ? mergeSession(s.sessions[idx], session) : session;
      const sessions =
        idx >= 0
          ? s.sessions.map((x, i) => (i === idx ? merged : x))
          : [...s.sessions, merged].slice(-10_000);
      return { sessions };
    });
    if (
      isNew &&
      eventType === "created" &&
      useTrafficStore.getState().autoSelect
    ) {
      set({ selectedId: session.id });
    }
  },

  init: async () => {
    await Promise.all([
      get().refreshStatus(),
      get().loadRules(),
      get().loadConfig(),
      get().loadCert(),
    ]);
    const sessions = (await api.listSessions()).map((s) =>
      normalizeSession(s as Session & Record<string, unknown>),
    );
    set({ sessions });
    const unlistenEvent = await onSessionEvent((payload) =>
      get().upsertSession(payload.session, payload.type),
    );
    const unlistenResync = await onSessionResync(() => {
      void get().reloadSessions();
    });
    return () => {
      unlistenEvent();
      unlistenResync();
    };
  },
}));
