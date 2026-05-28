import { useCallback, useRef, type ReactNode } from "react";

export function ResizablePane({
  height,
  onResize,
  children,
}: {
  height: number;
  onResize: (h: number) => void;
  children: ReactNode;
}) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = height;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      onResize(startH.current + delta);
    },
    [onResize],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div className="flex shrink-0 flex-col border-t border-[#333]" style={{ height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-[#2d2d2d] hover:bg-[#3794ff]/40"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="h-0.5 w-8 rounded bg-[#555]" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
