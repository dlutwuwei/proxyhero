import { useCallback, useEffect, useRef } from "react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { api } from "../api/tauri";
import {
  NOTIFICATIONS_MANIFEST_URL,
  NOTIFICATIONS_POLL_MS,
  NOTIFICATIONS_START_DELAY_MS,
} from "../config/remote";
import { useLocaleStore } from "../stores/localeStore";
import { useAppStore } from "../stores/appStore";
import { ensureNotificationPermission } from "../lib/notificationPermission";
import {
  filterMessages,
  pickLocaleText,
  type NotificationsManifest,
} from "../lib/notificationsManifest";
import type { AppConfig } from "../types";

async function fetchManifest(): Promise<NotificationsManifest | null> {
  const res = await fetch(NOTIFICATIONS_MANIFEST_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json() as Promise<NotificationsManifest>;
}

export function useNotifications() {
  const config = useAppStore((s) => s.config);
  const loadConfig = useAppStore((s) => s.loadConfig);
  const locale = useLocaleStore((s) => s.locale);
  const runningRef = useRef(false);

  const checkAndNotify = useCallback(async () => {
    if (runningRef.current || !config?.notificationsEnabled) return;
    runningRef.current = true;
    try {
      const manifest = await fetchManifest();
      if (!manifest?.messages?.length) return;

      const manifestVersion = manifest.manifestVersion ?? manifest.schemaVersion;
      const versionBumped =
        config.lastManifestVersion != null &&
        manifestVersion > config.lastManifestVersion;
      const filterSeen = versionBumped
        ? new Set<string>()
        : new Set(config.seenMessageIds ?? []);

      const candidates = filterMessages(manifest, {
        locale,
        seenIds: filterSeen,
        promotionalEnabled: config.promotionalEnabled ?? true,
      });

      const base: AppConfig = {
        ...config,
        lastCheckedAt: new Date().toISOString(),
        lastManifestVersion: manifestVersion,
      };

      if (!candidates.length) {
        await api.saveConfig(base);
        await loadConfig();
        return;
      }

      const granted = await ensureNotificationPermission();
      if (!granted) return;

      const msg = candidates[0];
      await sendNotification({
        title: pickLocaleText(msg.title, locale),
        body: pickLocaleText(msg.body, locale),
      });

      const nextSeen = [...new Set([...(config.seenMessageIds ?? []), msg.id])];
      await api.saveConfig({ ...base, seenMessageIds: nextSeen });
      await loadConfig();
    } catch (e) {
      console.error("Failed to check notifications manifest", e);
    } finally {
      runningRef.current = false;
    }
  }, [config, locale, loadConfig]);

  useEffect(() => {
    if (!config?.notificationsEnabled) return;
    const startTimer = window.setTimeout(() => {
      void checkAndNotify();
    }, NOTIFICATIONS_START_DELAY_MS);
    const interval = window.setInterval(() => {
      void checkAndNotify();
    }, NOTIFICATIONS_POLL_MS);
    return () => {
      clearTimeout(startTimer);
      clearInterval(interval);
    };
  }, [config?.notificationsEnabled, checkAndNotify]);

  return { checkAndNotify, lastCheckedAt: config?.lastCheckedAt ?? null };
}
