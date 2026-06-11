import { useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  splitVirtualLines,
  VIRTUAL_LINE_HEIGHT,
} from "./largeContent";

export function VirtualTextView({
  text,
  gutter,
  renderLine,
  className = "",
  lineClassName = "mono min-w-0 flex-1 whitespace-pre-wrap break-all text-xs leading-5 text-[#d4d4d4]",
}: {
  text: string;
  gutter?: boolean;
  renderLine?: (line: string, index: number) => ReactNode;
  className?: string;
  lineClassName?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => splitVirtualLines(text), [text]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_LINE_HEIGHT,
    overscan: 40,
  });

  return (
    <div
      ref={parentRef}
      className={`scroll-thin min-h-0 flex-1 overflow-auto bg-[#1e1e1e] ${className}`}
    >
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={vi.key}
            className="flex px-2"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
              height: `${vi.size}px`,
            }}
          >
            {gutter && (
              <span className="mono w-10 shrink-0 select-none pr-2 text-right text-[11px] leading-5 text-[#666]">
                {vi.index + 1}
              </span>
            )}
            {renderLine ? (
              renderLine(lines[vi.index], vi.index)
            ) : (
              <div className={lineClassName}>{lines[vi.index] || " "}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
