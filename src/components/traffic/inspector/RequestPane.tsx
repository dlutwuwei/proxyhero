import { BodyViewer } from "../../BodyViewer";
import { useT } from "../../../hooks/useT";
import type { Session } from "../../../types";
import {
  bodyText,
  buildRawRequest,
  parseCookieHeader,
  parseUrlQuery,
} from "../httpInspectorUtils";
import { KeyValueTable } from "./KeyValueTable";
import { MessagePane } from "./MessagePane";
import { RawHttpView } from "./RawHttpView";

export function RequestPane({ session }: { session: Session }) {
  const t = useT();
  const tabs = [
    { id: "headers", label: t("traffic.inspector.tab.headers") },
    { id: "query", label: t("traffic.inspector.tab.query") },
    { id: "body", label: t("traffic.inspector.tab.body") },
    { id: "cookies", label: t("traffic.inspector.tab.cookies") },
    { id: "raw", label: t("traffic.inspector.tab.raw") },
    { id: "summary", label: t("traffic.inspector.tab.summary") },
  ];

  const cookieHeader = session.request?.headers.find(
    ([k]) => k.toLowerCase() === "cookie",
  )?.[1];

  return (
    <MessagePane
      title="Request"
      tabs={tabs}
      defaultTab="headers"
      render={(tab) => {
        switch (tab) {
          case "headers":
            return (
              <KeyValueTable
                rows={session.request?.headers ?? []}
                emptyText={t("traffic.inspector.noReqHeaders")}
              />
            );
          case "query":
            return (
              <KeyValueTable
                rows={parseUrlQuery(session.url)}
                emptyText={t("traffic.inspector.noQuery")}
              />
            );
          case "body":
            return (
              <div className="flex min-h-[120px] flex-col">
                <BodyViewer msg={session.request} fill />
              </div>
            );
          case "cookies":
            return (
              <KeyValueTable
                rows={parseCookieHeader(cookieHeader)}
                emptyText={t("traffic.inspector.noCookies")}
              />
            );
          case "raw":
            return <RawHttpView text={buildRawRequest(session)} />;
          case "summary":
            return (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-3 text-xs">
                <dt className="text-[#888]">Method</dt>
                <dd className="mono">{session.method}</dd>
                <dt className="text-[#888]">URL</dt>
                <dd className="mono break-all text-emerald-400/90">
                  {session.url}
                </dd>
                <dt className="text-[#888]">Host</dt>
                <dd className="mono">{session.host}</dd>
                <dt className="text-[#888]">Path</dt>
                <dd className="mono break-all">{session.path}</dd>
                <dt className="text-[#888]">Size</dt>
                <dd>{session.requestSize} bytes</dd>
                <dt className="text-[#888]">Headers</dt>
                <dd>{session.request?.headers.length ?? 0}</dd>
                <dt className="text-[#888]">Body</dt>
                <dd>
                  {bodyText(session.request)
                    ? `${bodyText(session.request).length} chars`
                    : "—"}
                </dd>
                {session.tlsPreset && (
                  <>
                    <dt className="text-[#888]">{t("traffic.inspector.tlsPreset")}</dt>
                    <dd className="mono">{session.tlsPreset}</dd>
                  </>
                )}
              </dl>
            );
          default:
            return null;
        }
      }}
    />
  );
}
