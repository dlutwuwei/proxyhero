import { BodyViewer } from "../../BodyViewer";
import { useT } from "../../../hooks/useT";
import { RESPONSE_BODY_MAX_DISPLAY_BYTES } from "./largeContent";
import type { Session } from "../../../types";
import {
  bodyText,
  buildRawResponse,
  statusLabel,
  tryParseJson,
} from "../httpInspectorUtils";
import { JsonTreeView } from "./JsonTreeView";
import { KeyValueTable } from "./KeyValueTable";
import { MessagePane } from "./MessagePane";
import { RawHttpView } from "./RawHttpView";

export function ResponsePane({ session }: { session: Session }) {
  const t = useT();
  const tabs = [
    { id: "headers", label: t("traffic.inspector.tab.headers") },
    { id: "body", label: t("traffic.inspector.tab.body") },
    { id: "raw", label: t("traffic.inspector.tab.raw") },
    { id: "tree", label: t("traffic.inspector.tab.tree") },
    { id: "summary", label: t("traffic.inspector.tab.summary") },
  ];

  const contentType = session.response?.headers.find(
    ([k]) => k.toLowerCase() === "content-type",
  )?.[1];

  return (
    <MessagePane
      title="Response"
      tabs={tabs}
      defaultTab="raw"
      render={(tab) => {
        switch (tab) {
          case "headers":
            return (
              <KeyValueTable
                rows={session.response?.headers ?? []}
                emptyText={t("traffic.inspector.noResHeaders")}
              />
            );
          case "body":
            return (
              <div className="flex h-full min-h-0 flex-col">
                <BodyViewer
                  msg={session.response}
                  fill
                  autoFormat
                  maxDisplayBytes={RESPONSE_BODY_MAX_DISPLAY_BYTES}
                  copyOnlyWhenLarge
                />
              </div>
            );
          case "raw":
            return (
              <div className="flex h-full min-h-0 flex-col">
                <RawHttpView
                  text={buildRawResponse(session)}
                  maxDisplayBytes={RESPONSE_BODY_MAX_DISPLAY_BYTES}
                  copyOnlyWhenLarge
                />
              </div>
            );
          case "tree":
            return (
              <div className="flex h-full min-h-0 flex-col">
                <JsonTreeView text={bodyText(session.response)} />
              </div>
            );
          case "summary":
            return (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-3 text-xs">
                <dt className="text-[#888]">Status</dt>
                <dd className="mono">{statusLabel(session.status)}</dd>
                <dt className="text-[#888]">Duration</dt>
                <dd>{session.durationMs ?? "—"} ms</dd>
                <dt className="text-[#888]">Size</dt>
                <dd>{session.responseSize ?? "—"} bytes</dd>
                <dt className="text-[#888]">Content-Type</dt>
                <dd className="mono break-all">{contentType ?? "—"}</dd>
                <dt className="text-[#888]">Headers</dt>
                <dd>{session.response?.headers.length ?? 0}</dd>
                <dt className="text-[#888]">JSON</dt>
                <dd>
                  {tryParseJson(bodyText(session.response)) != null
                    ? t("common.yes")
                    : t("common.no")}
                </dd>
              </dl>
            );
          default:
            return null;
        }
      }}
    />
  );
}
