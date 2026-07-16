import type { AppRules, SslConfig } from "../types";

export function normalizeSslHost(value: string): string {
  let v = value.trim().toLowerCase();
  if (v.startsWith("https://")) v = v.slice("https://".length);
  else if (v.startsWith("http://")) v = v.slice("http://".length);
  const slash = v.indexOf("/");
  if (slash >= 0) v = v.slice(0, slash);
  v = v.replace(/\/+$/, "");
  if (v.startsWith("[")) return v;
  const colon = v.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(v.slice(colon + 1))) {
    return v.slice(0, colon);
  }
  return v;
}

function hostMatches(pattern: string, host: string): boolean {
  const p = normalizeSslHost(pattern);
  const h = normalizeSslHost(host);
  if (!p || !h) return false;
  if (p === h) return true;
  if (p.startsWith("*.")) {
    const suffix = p.slice(2);
    return h === suffix || h.endsWith(`.${suffix}`);
  }
  return false;
}

function isExactPattern(pattern: string): boolean {
  const p = normalizeSslHost(pattern);
  return !!p && !p.includes("*") && !p.includes("?");
}

/** 与后端 should_mitm_ssl 一致：仅 Include 解密；精确 Include 优先于 Exclude */
export function isSslEnabledForHost(ssl: SslConfig, host: string): boolean {
  const h = normalizeSslHost(host);
  if (!h) return false;
  const inInclude = ssl.includeHosts.some((p) => hostMatches(p, h));
  if (!inInclude) return false;
  const exactInclude = ssl.includeHosts.some(
    (p) => isExactPattern(p) && normalizeSslHost(p) === h,
  );
  if (exactInclude) return true;
  return !ssl.excludeHosts.some((p) => hostMatches(p, h));
}

function removeExactHost(list: string[], host: string): string[] {
  return list.filter((x) => {
    const p = normalizeSslHost(x);
    if (p.includes("*") || p.includes("?")) return true;
    return !hostMatches(p, host);
  });
}

export function enableSslForHost(rules: AppRules, host: string): AppRules {
  const h = normalizeSslHost(host);
  if (!h) return rules;
  const ssl = { ...rules.ssl };
  ssl.excludeHosts = removeExactHost(ssl.excludeHosts, h);
  if (!ssl.includeHosts.some((p) => hostMatches(p, h) && isExactPattern(p))) {
    ssl.includeHosts = [...ssl.includeHosts, h];
  }
  return { ...rules, ssl };
}

export function disableSslForHost(rules: AppRules, host: string): AppRules {
  const h = normalizeSslHost(host);
  if (!h) return rules;
  const ssl = { ...rules.ssl };
  ssl.includeHosts = removeExactHost(ssl.includeHosts, h);
  const stillIncluded = ssl.includeHosts.some((p) => hostMatches(p, h));
  if (stillIncluded) {
    // 仍被通配 Include 命中时，才写入 Exclude 做裁剪
    if (!ssl.excludeHosts.some((p) => hostMatches(p, h))) {
      ssl.excludeHosts = [...ssl.excludeHosts, h];
    }
  } else {
    ssl.excludeHosts = removeExactHost(ssl.excludeHosts, h);
  }
  return { ...rules, ssl };
}
