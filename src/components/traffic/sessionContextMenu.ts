import { api } from "../../api/tauri";
import type { TranslationKey } from "../../i18n/messages";
import { translate, type Locale } from "../../i18n/messages";
import { useAppStore } from "../../stores/appStore";
import { useTrafficStore } from "../../stores/trafficStore";
import type { AppRules, Session } from "../../types";
import { copyToClipboard } from "../../utils/clipboard";
import { enableSslForHost, disableSslForHost, isSslEnabledForHost } from "../../utils/sslHosts";
import { formatSessionTime } from "../../utils/formatTime";
import type { ContextMenuEntry } from "../ui/ContextMenu";
import { buildRawRequest, buildRawResponse } from "./httpInspectorUtils";
import { clientGroupKey } from "../../hooks/useFilteredSessions";

export type SessionColumn =
  | "seq"
  | "url"
  | "client"
  | "method"
  | "status"
  | "time";

export function columnFromTarget(target: EventTarget | null): SessionColumn {
  const el = (target as HTMLElement | null)?.closest?.("[data-col]");
  const col = el?.getAttribute("data-col");
  if (
    col === "seq" ||
    col === "url" ||
    col === "client" ||
    col === "method" ||
    col === "status" ||
    col === "time"
  ) {
    return col;
  }
  return "url";
}

function clientLabel(session: Session, locale: Locale): string {
  if (!session.userAgent?.trim()) {
    return translate(locale, "traffic.unidentifiedClient");
  }
  return session.clientName || session.clientAddr || "—";
}

export function cellValue(
  session: Session,
  column: SessionColumn,
  locale: Locale,
  seq?: number,
): string {
  switch (column) {
    case "seq":
      return seq != null ? String(seq) : "";
    case "url":
      return session.url;
    case "client":
      return clientLabel(session, locale);
    case "method":
      return session.isWebSocket ? "WS" : session.method;
    case "status":
      if (!session.completed) {
        return translate(locale, "traffic.filter.active");
      }
      return session.status != null ? String(session.status) : "—";
    case "time":
      return formatSessionTime(session.startedAt);
    default:
      return session.url;
  }
}

function t(locale: Locale, key: TranslationKey): string {
  return translate(locale, key);
}

export interface SessionContextState {
  locale: Locale;
  column: SessionColumn;
  seq?: number;
  domainFavorited: boolean;
  clientFavorited: boolean;
  sslEnabled: boolean;
  rules: AppRules | null;
}

export interface SessionContextHandlers {
  onCopyDone?: (messageKey: TranslationKey) => void;
  onCopyError?: (message: string) => void;
  onSslSaved?: () => void;
}

export function buildSessionContextMenu(
  session: Session,
  state: SessionContextState,
  handlers: SessionContextHandlers,
): ContextMenuEntry[] {
  const { locale, column, seq, domainFavorited, clientFavorited, sslEnabled } =
    state;
  const isWs = !!session.isWebSocket;
  const hasResponse = session.completed && !!session.response;

  const copyText = async (text: string, doneKey?: TranslationKey) => {
    await copyToClipboard(text);
    if (doneKey) handlers.onCopyDone?.(doneKey);
  };

  const copyCurl = async () => {
    try {
      const curl = await api.sessionToCurl(session.id);
      await copyToClipboard(curl);
      handlers.onCopyDone?.("traffic.inspector.curlCopied");
    } catch (e) {
      handlers.onCopyError?.(String(e));
    }
  };

  const copyAsItems: ContextMenuEntry[] = [
    {
      type: "item",
      label: t(locale, "traffic.context.copyAsUrl"),
      onClick: () => void copyText(session.url),
    },
    {
      type: "item",
      label: t(locale, "traffic.context.copyAsCurl"),
      disabled: isWs,
      onClick: () => void copyCurl(),
    },
    {
      type: "item",
      label: t(locale, "traffic.context.copyAsRequest"),
      onClick: () => void copyText(buildRawRequest(session)),
    },
    {
      type: "item",
      label: t(locale, "traffic.context.copyAsResponse"),
      disabled: !hasResponse,
      onClick: () => void copyText(buildRawResponse(session)),
    },
  ];

  const exportItems: ContextMenuEntry[] = [
    {
      type: "item",
      label: t(locale, "traffic.context.exportRequest"),
      onClick: () => void copyText(buildRawRequest(session)),
    },
    {
      type: "item",
      label: t(locale, "traffic.context.exportResponse"),
      disabled: !hasResponse,
      onClick: () => void copyText(buildRawResponse(session)),
    },
  ];

  const clientKey = clientGroupKey(session);
  const showSslActions =
    session.isHttps ||
    session.scheme === "https" ||
    session.method.toUpperCase() === "CONNECT";

  return [
    {
      type: "item",
      label: t(locale, "traffic.context.copyUrl"),
      shortcut: "⌘ C",
      onClick: () => void copyText(session.url),
    },
    {
      type: "item",
      label: t(locale, "traffic.context.copyCurl"),
      shortcut: "⇧ ⌘ C",
      disabled: isWs,
      onClick: () => void copyCurl(),
    },
    {
      type: "item",
      label: t(locale, "traffic.context.copyCell"),
      onClick: () => void copyText(cellValue(session, column, locale, seq)),
    },
    {
      type: "submenu",
      label: t(locale, "traffic.context.copyAs"),
      items: copyAsItems,
    },
    { type: "separator" },
    {
      type: "item",
      label: t(locale, "traffic.context.filterHost"),
      onClick: () => {
        useTrafficStore.getState().setSideTab("domains");
        useTrafficStore.getState().setSideSelection(session.host);
      },
    },
    { type: "separator" },
    {
      type: "submenu",
      label: t(locale, "traffic.context.tools"),
      items: [
        {
          type: "item",
          label: t(locale, "traffic.context.addRemote"),
          onClick: () =>
            useAppStore.getState().openRemoteRuleFromSession(session),
        },
        {
          type: "item",
          label: t(locale, "traffic.context.addLocal"),
          disabled: isWs,
          onClick: () =>
            void useAppStore.getState().openLocalRuleFromSession(session),
        },
        {
          type: "item",
          label: domainFavorited
            ? t(locale, "traffic.sidebar.unfavoriteDomain")
            : t(locale, "traffic.sidebar.favoriteDomain"),
          onClick: () =>
            useTrafficStore.getState().toggleFavoriteDomain(session.host),
        },
        {
          type: "item",
          label: clientFavorited
            ? t(locale, "traffic.sidebar.unfavoriteClient")
            : t(locale, "traffic.sidebar.favoriteClient"),
          onClick: () =>
            useTrafficStore.getState().toggleFavoriteClient(clientKey),
        },
      ],
    },
    { type: "separator" },
    {
      type: "submenu",
      label: t(locale, "traffic.context.export"),
      items: exportItems,
    },
    { type: "separator" },
    ...(showSslActions
      ? [
          {
            type: "item" as const,
            label: sslEnabled
              ? t(locale, "traffic.context.disableSsl")
              : t(locale, "traffic.context.enableSsl"),
            disabled: !state.rules,
            onClick: () =>
              void (sslEnabled
                ? disableSsl(session, locale, handlers)
                : enableSsl(session, locale, handlers)),
          },
          { type: "separator" as const },
        ]
      : []),
    {
      type: "item",
      label: t(locale, "traffic.context.delete"),
      shortcut: "⌫",
      onClick: () => void useAppStore.getState().clearSession(session.id),
    },
  ];
}

async function enableSsl(
  session: Session,
  locale: Locale,
  handlers: SessionContextHandlers,
) {
  const { rules, loadRules, setMessage } = useAppStore.getState();
  if (!rules) return;
  const next = enableSslForHost(rules, session.host);
  await api.saveRules(next);
  await loadRules();
  handlers.onSslSaved?.();
  setMessage(translate(locale, "ssl.saved"));
  setTimeout(() => setMessage(null), 2000);
}

async function disableSsl(
  session: Session,
  locale: Locale,
  handlers: SessionContextHandlers,
) {
  const { rules, loadRules, setMessage } = useAppStore.getState();
  if (!rules) return;
  const next = disableSslForHost(rules, session.host);
  await api.saveRules(next);
  await loadRules();
  handlers.onSslSaved?.();
  setMessage(translate(locale, "ssl.saved"));
  setTimeout(() => setMessage(null), 2000);
}

export function sessionSslEnabled(
  rules: AppRules | null,
  host: string,
): boolean {
  if (!rules) return false;
  return isSslEnabledForHost(rules.ssl, host);
}
