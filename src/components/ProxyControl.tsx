import { useAppStore } from "../stores/appStore";
import { useT } from "../hooks/useT";

export function useProxyEnabled() {
  const running = useAppStore((s) => s.proxyStatus.running);
  const systemOn = useAppStore((s) => s.config?.systemProxyEnabled ?? false);
  return running && systemOn;
}

export function ProxyToggleButton({
  className = "",
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const t = useT();
  const enabled = useProxyEnabled();
  const toggleProxy = useAppStore((s) => s.toggleProxy);
  const padding = size === "md" ? "px-3 py-1.5 text-sm" : "px-3 py-1 text-xs";

  return (
    <button
      type="button"
      onClick={() => toggleProxy()}
      className={`rounded font-medium ${padding} ${
        enabled
          ? "bg-red-800/80 hover:bg-red-700"
          : "bg-emerald-700 hover:bg-emerald-600"
      } ${className}`}
    >
      {enabled ? t("proxy.stop") : t("proxy.start")}
    </button>
  );
}
