import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useT } from "./useT";
import { useAppStore } from "../stores/appStore";

export function useUpdater() {
  const t = useT();
  const setMessage = useAppStore((s) => s.setMessage);
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    date?: string;
    body?: string;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      const update = await check();
      if (update?.available) {
        setUpdateAvailable(true);
        setUpdateInfo({
          version: update.version,
          date: update.date,
          body: update.body,
        });
      } else {
        setMessage(t("updates.noUpdate"));
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("Failed to check for updates", error);
      setMessage("检查更新失败");
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    setDownloading(true);
    try {
      const update = await check();
      if (update?.available) {
        let downloaded = 0;
        let contentLength = 0;

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started":
              contentLength = event.data.contentLength ?? 0;
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                setDownloadProgress(Math.round((downloaded / contentLength) * 100));
              }
              break;
            case "Finished":
              setDownloading(false);
              setDownloadProgress(0);
              break;
          }
        });
      }
    } catch (error) {
      console.error("Failed to install update", error);
      setMessage("安装更新失败");
      setTimeout(() => setMessage(null), 3000);
      setDownloading(false);
    }
  };

  const checkNotificationPermission = async () => {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }
    return permissionGranted;
  };

  const sendReleaseNotification = async (version: string) => {
    const hasPermission = await checkNotificationPermission();
    if (hasPermission) {
      await sendNotification({
        title: t("notifications.newRelease"),
        body: `ProxyHero v${version} 已发布`,
      });
    }
  };

  useEffect(() => {
    checkForUpdates();
  }, []);

  return {
    checking,
    updateAvailable,
    updateInfo,
    downloading,
    downloadProgress,
    checkForUpdates,
    installUpdate,
    sendReleaseNotification,
  };
}
