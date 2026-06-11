import type { ReactNode } from "react";

export function Modal({
  open,
  title,
  footer,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  title: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={`flex max-h-[calc(100vh-2rem)] w-full ${maxWidth} flex-col rounded border border-[#444] bg-[#252526] shadow-xl`}
      >
        <div className="shrink-0 px-4 pt-4">
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>
        <div className="shrink-0 px-4 pb-4 pt-2">{footer}</div>
      </div>
    </div>
  );
}
