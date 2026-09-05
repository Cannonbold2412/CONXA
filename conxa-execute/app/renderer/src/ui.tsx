import { useEffect, useRef, useState, type ReactNode } from "react";
import iconUrl from "./assets/icon.png";

export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export const paths = {
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  panel: "M3 5h18v14H3zM9 5v14",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  x: "M18 6 6 18M6 6l12 12",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  moon: "M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z",
  chevron: "M6 9l6 6 6-6",
  play: "M8 5v14l11-7z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  spark: "M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z",
  dots: "M12 12h.01M12 5h.01M12 19h.01",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  back: "M19 12H5M12 19l-7-7 7-7",
  forward: "M5 12h14M12 5l7 7-7 7",
  minimize: "M5 19h14",
  maximize: "M6 6h12v12H6z",
  restore: "M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4",
};

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={iconUrl}
      alt="CONXA"
      width={size}
      height={size}
      className={`shrink-0 rounded-lg ${className}`}
      draggable={false}
    />
  );
}

export function Row({
  icon,
  children,
  active,
  onClick,
  onDelete,
  showMenu = true,
}: {
  icon?: ReactNode;
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  showMenu?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <div
      className={`group relative flex items-center rounded-lg ${
        active ? "bg-bg-active text-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg"
      }`}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left text-[13px]">
        {icon}
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
      {showMenu && onDelete && (
        <div ref={menuRef} className="relative shrink-0 pr-1">
          <button
            type="button"
            aria-label="Row options"
            aria-expanded={menuOpen}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-fg-dim transition-opacity hover:bg-bg-elevated hover:text-fg ${
              menuOpen ? "opacity-100" : "opacity-50 group-hover:opacity-100"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <Icon d={paths.dots} size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-0.5 min-w-[108px] rounded-lg border border-line bg-bg-elevated p-1 text-[13px] shadow-xl">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-err hover:bg-bg-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <Icon d={paths.trash} size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
