import type { MapLocalRule, MapRemoteRule } from "../../types";

export function newRemoteRule(): MapRemoteRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    name: "新规则",
    order: 0,
    matchRule: {
      protocol: "https",
      host: "api.example.com",
      path: "",
    },
    mapTo: {
      protocol: "http",
      host: "127.0.0.1",
      port: 8080,
      preservePath: true,
      preserveQuery: true,
    },
  };
}

export function newLocalRule(): MapLocalRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    name: "本地 Mock",
    order: 0,
    matchRule: { host: "api.example.com", path: "/user/info" },
    localFile: "",
    status: 200,
    headers: { "Content-Type": "application/json" },
  };
}

export function formatMapTarget(
  protocol: string,
  host: string,
  port: number,
): string {
  return `${protocol}://${host}:${port}`;
}
