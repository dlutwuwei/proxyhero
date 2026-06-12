import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  estimateWrappedLineHeight,
  splitVirtualLines,
  VIRTUAL_LINE_HEIGHT,
} from "./largeContent";

export function VirtualTextView({
  text,
  gutter,
  renderLine,
  className = "",
  lineClassName = "mono min-w-0 w-full whitespace-pre-wrap break-all text-xs leading-5 text-[#d4d4d4]",
  lineHeight = VIRTUAL_LINE_HEIGHT,
  gutterClassName = "mono shrink-0 select-none text-right text-[11px] leading-5 text-[#666]",
}: {
  text: string;
  gutter?: boolean;
  renderLine?: (line: string, index: number) => ReactNode;
  className?: string;
  lineClassName?: string;
  lineHeight?: number;
  gutterClassName?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const lines = useMemo(() => splitVirtualLines(text), [text]);
  const hasGutter = gutter === true;

  const estimateSize = useCallback(
    (index: number) =>
      estimateWrappedLineHeight(
        lines[index] ?? "",
        containerWidth,
        hasGutter,
        lineHeight,
      ),
    [lines, containerWidth, hasGutter, lineHeight],
  );

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 12,
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    virtualizerRef.current.measure();
  }, [lines, containerWidth, lineHeight, hasGutter]);

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
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="box-border w-full px-2"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            <div
              className={
                hasGutter
                  ? "grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-2"
                  : "min-w-0"
              }
            >
              {hasGutter && (
                <span className={gutterClassName}>{vi.index + 1}</span>
              )}
              {renderLine ? (
                renderLine(lines[vi.index], vi.index)
              ) : (
                <div className={lineClassName}>{lines[vi.index] || " "}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
