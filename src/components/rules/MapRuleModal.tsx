import { useEffect, useState } from "react";
import { useT } from "../../hooks/useT";
import type { MapLocalRule, MapRemoteRule } from "../../types";

type RemoteDraft = MapRemoteRule;
type LocalDraft = MapLocalRule;

export function MapRemoteModal({
  open,
  initial,
  isNew,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: MapRemoteRule | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (rule: MapRemoteRule) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<RemoteDraft | null>(null);

  useEffect(() => {
    if (open && initial) setDraft({ ...initial });
  }, [open, initial]);

  if (!open || !draft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded border border-[#444] bg-[#252526] p-4 shadow-xl">
        <h3 className="mb-3 text-sm font-medium">
          {isNew ? t("rules.modal.addRemote") : t("rules.modal.editRemote")}
        </h3>
        <div className="space-y-2 text-xs">
          <label className="block">
            {t("rules.modal.name")}
            <input
              className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="block">
            {t("rules.modal.protocol")}
            <select
              className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.matchRule.protocol ?? "https"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, protocol: e.target.value },
                })
              }
            >
              <option value="https">https</option>
              <option value="http">http</option>
              <option value="*">*</option>
            </select>
          </label>
          <label className="block">
            {t("rules.modal.matchHost")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              placeholder="api.example.com"
              value={draft.matchRule.host}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, host: e.target.value },
                })
              }
            />
          </label>
          <label className="block">
            {t("rules.modal.matchPath")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              placeholder="/api/**"
              value={draft.matchRule.path ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, path: e.target.value },
                })
              }
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              {t("rules.modal.targetProtocol")}
              <select
                className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
                value={draft.mapTo.protocol}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mapTo: { ...draft.mapTo, protocol: e.target.value },
                  })
                }
              >
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </label>
            <label className="col-span-1 block">
              {t("rules.modal.targetHost")}
              <input
                className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
                value={draft.mapTo.host}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mapTo: { ...draft.mapTo, host: e.target.value },
                  })
                }
              />
            </label>
            <label className="block">
              {t("rules.modal.targetPort")}
              <input
                type="number"
                className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
                value={draft.mapTo.port}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mapTo: { ...draft.mapTo, port: Number(e.target.value) },
                  })
                }
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#333] px-3 py-1.5 text-xs hover:bg-[#444]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              const path = draft.matchRule.path?.trim();
              onSave({
                ...draft,
                matchRule: {
                  ...draft.matchRule,
                  path: path ? path : undefined,
                },
              });
            }}
            className="rounded bg-[#094771] px-3 py-1.5 text-xs hover:bg-[#0e5a8a]"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MapLocalModal({
  open,
  initial,
  isNew,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: MapLocalRule | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (rule: MapLocalRule) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<LocalDraft | null>(null);

  useEffect(() => {
    if (open && initial) setDraft({ ...initial });
  }, [open, initial]);

  if (!open || !draft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded border border-[#444] bg-[#252526] p-4 shadow-xl">
        <h3 className="mb-3 text-sm font-medium">
          {isNew ? t("rules.modal.addLocal") : t("rules.modal.editLocal")}
        </h3>
        <div className="space-y-2 text-xs">
          <label className="block">
            {t("rules.modal.name")}
            <input
              className="mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="block">
            {t("rules.modal.matchHost")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.matchRule.host}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, host: e.target.value },
                })
              }
            />
          </label>
          <label className="block">
            {t("rules.modal.matchPath")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.matchRule.path ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  matchRule: { ...draft.matchRule, path: e.target.value },
                })
              }
            />
          </label>
          <label className="block">
            {t("rules.modal.localPath")}
            <input
              className="mono mt-1 w-full rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.localFile}
              onChange={(e) =>
                setDraft({ ...draft, localFile: e.target.value })
              }
            />
          </label>
          <label className="block">
            {t("rules.modal.statusCode")}
            <input
              type="number"
              className="mt-1 w-32 rounded border border-[#444] bg-[#1e1e1e] px-2 py-1.5"
              value={draft.status}
              onChange={(e) =>
                setDraft({ ...draft, status: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#333] px-3 py-1.5 text-xs hover:bg-[#444]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded bg-[#094771] px-3 py-1.5 text-xs hover:bg-[#0e5a8a]"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
