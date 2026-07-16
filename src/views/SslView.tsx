import { api } from "../api/tauri";
import { useT } from "../hooks/useT";
import { useAppStore } from "../stores/appStore";
import { normalizeSslHost } from "../utils/sslHosts";

export function SslView() {
  const t = useT();
  const rules = useAppStore((s) => s.rules);
  const loadRules = useAppStore((s) => s.loadRules);
  const setMessage = useAppStore((s) => s.setMessage);

  if (!rules) return null;

  const save = async (next: typeof rules) => {
    await api.saveRules(next);
    await loadRules();
    setMessage(t("ssl.saved"));
    setTimeout(() => setMessage(null), 2000);
  };

  const addHost = (list: "includeHosts" | "excludeHosts", host: string) => {
    const normalized = normalizeSslHost(host);
    if (!normalized) return;
    if (rules.ssl[list].includes(normalized)) return;
    const ssl = { ...rules.ssl };
    if (list === "includeHosts") {
      ssl.excludeHosts = ssl.excludeHosts.filter(
        (h) => normalizeSslHost(h) !== normalized,
      );
      ssl.includeHosts = [...ssl.includeHosts, normalized];
    } else {
      ssl.includeHosts = ssl.includeHosts.filter(
        (h) => normalizeSslHost(h) !== normalized,
      );
      ssl.excludeHosts = [...ssl.excludeHosts, normalized];
    }
    save({ ...rules, ssl });
  };

  const removeHost = (list: "includeHosts" | "excludeHosts", host: string) => {
    save({
      ...rules,
      ssl: {
        ...rules.ssl,
        [list]: rules.ssl[list].filter((h) => h !== host),
      },
    });
  };

  return (
    <div className="overflow-auto p-4">
      <h2 className="mb-4 text-lg font-medium">{t("ssl.title")}</h2>
      <p className="mb-4 text-sm text-[#888]">{t("ssl.desc")}</p>

      <HostList
        title={t("ssl.includeTitle")}
        hosts={rules.ssl.includeHosts}
        onAdd={(h) => addHost("includeHosts", h)}
        onRemove={(h) => removeHost("includeHosts", h)}
      />
      <HostList
        title={t("ssl.excludeTitle")}
        hosts={rules.ssl.excludeHosts}
        onAdd={(h) => addHost("excludeHosts", h)}
        onRemove={(h) => removeHost("excludeHosts", h)}
      />
    </div>
  );
}

function HostList({
  title,
  hosts,
  onAdd,
  onRemove,
}: {
  title: string;
  hosts: string[];
  onAdd: (h: string) => void;
  onRemove: (h: string) => void;
}) {
  const t = useT();
  let input: HTMLInputElement | null = null;
  return (
    <section className="mb-6 rounded border border-[#333] bg-[#252526] p-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="mb-2 flex gap-2">
        <input
          ref={(el) => {
            input = el;
          }}
          className="flex-1 rounded border border-[#444] bg-[#1e1e1e] px-2 py-1 text-sm"
          placeholder="*.example.com"
          onKeyDown={(e) => {
            if (e.key === "Enter" && input) {
              onAdd(input.value);
              input.value = "";
            }
          }}
        />
        <button
          type="button"
          className="rounded bg-[#333] px-3 text-sm"
          onClick={() => {
            if (input) {
              onAdd(input.value);
              input.value = "";
            }
          }}
        >
          {t("common.add")}
        </button>
      </div>
      <ul className="space-y-1 text-sm">
        {hosts.map((h) => (
          <li key={h} className="flex items-center justify-between rounded bg-[#1e1e1e] px-2 py-1">
            <span className="mono">{h}</span>
            <button type="button" className="text-red-400 text-xs" onClick={() => onRemove(h)}>
              {t("common.remove")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
