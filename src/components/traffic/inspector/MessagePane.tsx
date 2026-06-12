import { useState, type ReactNode } from "react";

export type TabDef = { id: string; label: string };

export function MessagePane({
  title,
  tabs,
  defaultTab,
  render,
}: {
  title: string;
  tabs: TabDef[];
  defaultTab: string;
  render: (tabId: string) => ReactNode;
}) {
  const [active, setActive] = useState(defaultTab);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-[#333]">
      <div className="flex shrink-0 items-center overflow-x-auto border-b border-[#333] px-2 text-xs">
        <span className="mr-3 shrink-0 whitespace-nowrap py-2 font-medium text-[#ccc]">
          {title}
        </span>
        <div className="flex shrink-0 items-center">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`shrink-0 whitespace-nowrap px-2.5 py-2 ${
                active === t.id
                  ? "text-[#3794ff]"
                  : "text-[#888] hover:text-[#ccc]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">{render(active)}</div>
      </div>
    </div>
  );
}
