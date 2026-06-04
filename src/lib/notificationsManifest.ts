import type { Locale } from "../i18n/messages";
import type { NotificationMessageType } from "../types";
import { APP_VERSION } from "../config/remote";

export interface LocaleText {
  zh?: string;
  en?: string;
  [key: string]: string | undefined;
}

export interface NotificationMessage {
  id: string;
  type: NotificationMessageType;
  title: LocaleText;
  body: LocaleText;
  actionUrl?: string;
  startsAt: string;
  endsAt: string;
  minAppVersion?: string;
  maxAppVersion?: string | null;
  priority?: number;
}

export interface NotificationsManifest {
  schemaVersion: number;
  manifestVersion?: number;
  messages: NotificationMessage[];
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
}

export function compareSemver(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function pickLocaleText(text: LocaleText, locale: Locale): string {
  return text[locale] ?? text.zh ?? text.en ?? Object.values(text).find(Boolean) ?? "";
}

export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function filterMessages(
  manifest: NotificationsManifest,
  opts: {
    locale: Locale;
    seenIds: Set<string>;
    promotionalEnabled: boolean;
    appVersion?: string;
    now?: Date;
  },
): NotificationMessage[] {
  const now = opts.now ?? new Date();
  const appVersion = opts.appVersion ?? APP_VERSION;

  return manifest.messages
    .filter((msg) => {
      if (opts.seenIds.has(msg.id)) return false;
      if (msg.type === "promo" && !opts.promotionalEnabled) return false;
      const start = Date.parse(msg.startsAt);
      const end = Date.parse(msg.endsAt);
      if (Number.isNaN(start) || Number.isNaN(end)) return false;
      if (now.getTime() < start || now.getTime() > end) return false;
      if (msg.minAppVersion && compareSemver(appVersion, msg.minAppVersion) < 0) {
        return false;
      }
      if (msg.maxAppVersion && compareSemver(appVersion, msg.maxAppVersion) > 0) {
        return false;
      }
      if (msg.actionUrl && !isHttpsUrl(msg.actionUrl)) return false;
      return pickLocaleText(msg.title, opts.locale).length > 0;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
