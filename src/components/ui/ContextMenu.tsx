import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  type: "item";
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
};

export type ContextMenuSeparator = { type: "separator" };

export type ContextMenuSubmenu = {
  type: "submenu";
  label: string;
  items: ContextMenuEntry[];
};

export type ContextMenuEntry =
  | ContextMenuItem
  | ContextMenuSeparator
  | ContextMenuSubmenu;

function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } {
  const pad = 8;
  const maxLeft = Math.max(pad, window.innerWidth - width - pad);
  const maxTop = Math.max(pad, window.innerHeight - height - pad);
  return {
    left: Math.min(x, maxLeft),
    top: Math.min(y, maxTop),
  };
}

const panelClass =
  "fixed z-[201] min-w-[180px] rounded border border-[#444] bg-[#2d2d2d] py-1 shadow-lg";

function MenuPanel({
  items,
  style,
  panelRef,
  onClose,
  onItemClick,
}: {
  items: ContextMenuEntry[];
  style: CSSProperties;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onItemClick: (fn?: () => void) => void;
}) {
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const updateSubmenuPos = useCallback((index: number) => {
    const el = itemRefs.current[index];
    if (!el) return;
    const itemRect = el.getBoundingClientRect();
    const subW = 180;
    const subH = 200;
    let left = itemRect.right - 2;
    if (left + subW > window.innerWidth - 8) {
      left = itemRect.left - subW + 2;
    }
    let top = itemRect.top;
    if (top + subH > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - subH - 8);
    }
    setSubPos({ left, top });
  }, []);

  const handleSubmenuEnter = (index: number) => {
    setOpenSubmenu(index);
    requestAnimationFrame(() => updateSubmenuPos(index));
  };

  return (
    <div
      ref={panelRef}
      className={panelClass}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((entry, i) => {
        if (entry.type === "separator") {
          return <div key={`sep-${i}`} className="my-1 border-t border-[#444]" />;
        }
        if (entry.type === "submenu") {
          return (
            <div
              key={`sub-${i}`}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="relative flex cursor-default items-center justify-between px-3 py-1.5 text-xs text-[#ccc] hover:bg-[#094771]"
              onMouseEnter={() => handleSubmenuEnter(i)}
              onMouseLeave={() => {
                setOpenSubmenu(null);
                setSubPos(null);
              }}
            >
              <span>{entry.label}</span>
              <span className="ml-4 text-[#666]">›</span>
              {openSubmenu === i &&
                subPos &&
                createPortal(
                  <MenuPanel
                    items={entry.items}
                    style={{
                      position: "fixed",
                      left: subPos.left,
                      top: subPos.top,
                    }}
                    onClose={onClose}
                    onItemClick={onItemClick}
                  />,
                  document.body,
                )}
            </div>
          );
        }
        return (
          <button
            key={`item-${i}`}
            type="button"
            disabled={entry.disabled}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-[#ccc] hover:bg-[#094771] disabled:cursor-default disabled:text-[#555] disabled:hover:bg-transparent"
            onClick={() => onItemClick(entry.onClick)}
            onMouseEnter={() => {
              setOpenSubmenu(null);
              setSubPos(null);
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && (
              <span className="ml-6 shrink-0 text-[10px] text-[#666]">
                {entry.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    setPos({ left: x, top: y });
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(clampPosition(x, y, width, height));
  }, [x, y, items]);

  const onItemClick = (fn?: () => void) => {
    if (!fn) return;
    fn();
    onClose();
  };

  const menuStyle: CSSProperties = {
    position: "fixed",
    left: pos.left,
    top: pos.top,
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <MenuPanel
        items={items}
        style={menuStyle}
        panelRef={panelRef}
        onClose={onClose}
        onItemClick={onItemClick}
      />
    </>,
    document.body,
  );
}
