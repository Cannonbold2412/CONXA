import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from "react";

export function Icon({ d, size = 16, stroke = 1.75, className }: { d: string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

export const paths = {
  plus: "M12 5v14M5 12h14",
  panel: "M3 5h18v14H3zM9 5v14",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  x: "M18 6 6 18M6 6l12 12",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  chevron: "M6 9l6 6 6-6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  dots: "M12 12h.01M12 5h.01M12 19h.01",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  back: "M15 18l-6-6 6-6",
  forward: "M9 18l6-6-6-6",
  minimize: "M5 19h14",
  maximize: "M6 6h12v12H6z",
  restore: "M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4",
  reload: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  copy: "M9 9h11v11H9zM5 15V5h10",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  check: "M20 6 9 17l-5-5",
  tick: "M5 12.5l4.5 4.5L19 7",
  chevronUp: "M6 15l6-6 6 6",
  updown: "M8 9l4-4 4 4M8 15l4 4 4-4",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4",
  question: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01",
  warning: "M12 4l9 16H3zM12 10v4M12 17h.01",
  paperclip: "M20 12l-8.5 8.5a5 5 0 0 1-7-7L13 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 8",
  screenshot: "M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  browser: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM15 4v16",
  retry: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  upload: "M12 15V4M7 9l5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
};

/** The Conxa mark: brand-orange rounded square with a dark chevron. */
export function BrandMark({ size = 22 }: { size?: 22 | 34 }) {
  const big = size === 34;
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-brand text-bg ${big ? "h-[34px] w-[34px] rounded-[9px]" : "h-[22px] w-[22px] rounded-md"}`}
      aria-hidden
    >
      <Icon d="M9 7l5 5-5 5" size={big ? 20 : 14} stroke={big ? 2.8 : 3} />
    </span>
  );
}

/** Hover-revealed copy (+ optional edit) icons under a chat message; parent needs `group`. */
export function MsgActions({ text, onEdit, className = "" }: { text: string; onEdit?: () => void; className?: string }) {
  const [copied, setCopied] = useState(false);
  const btn = "flex h-6 w-6 items-center justify-center rounded-md text-fg-dim hover:bg-bg-hover hover:text-fg";
  return (
    <div className={`flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${className}`}>
      <button
        type="button"
        className={btn}
        title={copied ? "Copied" : "Copy"}
        aria-label="Copy message"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        <Icon d={copied ? paths.check : paths.copy} size={14} />
      </button>
      {onEdit && (
        <button type="button" className={btn} title="Edit" aria-label="Edit message" onClick={onEdit}>
          <Icon d={paths.edit} size={14} />
        </button>
      )}
    </div>
  );
}

const BUTTON_VARIANT_CLASS = {
  primary: "bg-fg text-bg hover:opacity-90",
  secondary: "border border-line text-fg-muted hover:bg-bg-hover",
};

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${BUTTON_VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Row({
  icon,
  children,
  active,
  onClick,
  onDelete,
}: {
  icon?: ReactNode;
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
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
      <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className="flex h-[34px] min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left text-[13.5px]">
        {icon}
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
      {onDelete && (
        <div ref={menuRef} className="relative shrink-0 pr-1">
          <button
            type="button"
            aria-label="Row options"
            aria-expanded={menuOpen}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-fg-dim transition-opacity hover:bg-bg-elevated hover:text-fg ${
              menuOpen ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
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
