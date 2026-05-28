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
      <div className="flex shrink-0 items-center border-b border-[#333] px-2 text-xs">
        <span className="mr-3 py-2 font-medium text-[#ccc]">{title}</span>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`px-2.5 py-2 ${
              active === t.id
                ? "text-[#3794ff]"
                : "text-[#888] hover:text-[#ccc]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        {render(active)}
      </div>
    </div>
  );
}
