import { useState, useEffect, useCallback } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useT } from "./useT";

const GITHUB_REPO = "wuwei/proxyhero";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

export function useGitHubReleases() {
  const t = useT();
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkLatestRelease = useCallback(async (showNotification = false) => {
    setLoading(true);
    try {
      const response = await fetch(GITHUB_API);
      if (!response.ok) throw new Error("Failed to fetch releases");
      const release: GitHubRelease = await response.json();
      
      setLatestRelease(release);
      setLastChecked(new Date().toISOString());
      
      if (showNotification) {
        const hasPermission = await checkNotificationPermission();
        if (hasPermission) {
          await sendNotification({
            title: t("notifications.newRelease"),
            body: `${release.name} 已发布`,
          });
        }
      }
      
      return release;
    } catch (error) {
      console.error("Failed to check GitHub releases", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [t]);

  const checkNotificationPermission = async () => {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }
    return permissionGranted;
  };

  useEffect(() => {
    checkLatestRelease(true);
    const interval = setInterval(() => checkLatestRelease(false), 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkLatestRelease]);

  return {
    latestRelease,
    loading,
    lastChecked,
    checkLatestRelease,
  };
}
