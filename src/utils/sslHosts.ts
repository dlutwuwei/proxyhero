import type { AppRules, SslConfig } from "../types";

export function isSslEnabledForHost(ssl: SslConfig, host: string): boolean {
  const h = host.trim();
  if (!h) return false;
  if (ssl.excludeHosts.includes(h)) return false;
  if (ssl.mode === "include") return ssl.includeHosts.includes(h);
  return true;
}

export function enableSslForHost(rules: AppRules, host: string): AppRules {
  const h = host.trim();
  if (!h) return rules;
  const ssl = { ...rules.ssl };
  ssl.excludeHosts = ssl.excludeHosts.filter((x) => x !== h);
  if (ssl.mode === "include" && !ssl.includeHosts.includes(h)) {
    ssl.includeHosts = [...ssl.includeHosts, h];
  }
  return { ...rules, ssl };
}
