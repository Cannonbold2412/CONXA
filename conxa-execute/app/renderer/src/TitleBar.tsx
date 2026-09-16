import { useEffect, useState, type ReactNode } from "react";
import { Icon, paths } from "./ui";

function Chrome({
  label,
  onClick,
  disabled,
  children,
  size = "small",
  className = "",
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  size?: "small" | "wide";
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`app-region-no-drag flex h-9 items-center justify-center text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30 ${
        size === "wide" ? "w-11" : "w-9 rounded-md"
      } ${className}`}
    >
      {children}
    </button>
  );
}

type Props = {
  onToggleSidebar: () => void;
  onMenu: () => void;
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
};

export function TitleBar({
  onToggleSidebar,
  onMenu,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
}: Props) {
  const wc = window.conxaExecute.windowControls;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    void wc.isMaximized().then((value) => {
      if (mounted) setIsMaximized(value);
    });
    const unsubscribe = wc.onMaximizeChange(setIsMaximized);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [wc]);

  return (
    <header className="app-region-drag flex h-10 shrink-0 select-none items-center border-b border-line bg-bg-sidebar">
      <div className="app-region-no-drag flex items-center gap-0.5 pl-1.5">
        <Chrome label="Menu" onClick={onMenu}>
          <Icon d={paths.menu} size={16} />
        </Chrome>
        <Chrome label="Toggle sidebar" onClick={onToggleSidebar}>
          <Icon d={paths.panel} size={16} />
        </Chrome>
        <Chrome label="Back" onClick={onBack} disabled={!canGoBack}>
          <Icon d={paths.back} size={16} />
        </Chrome>
        <Chrome label="Forward" onClick={onForward} disabled={!canGoForward}>
          <Icon d={paths.forward} size={16} />
        </Chrome>
      </div>

      <div className="min-w-0 flex-1" />

      {/* Account lives in the sidebar footer only — a second avatar here used to
          toggle the same popover, which is anchored to the sidebar, so clicking
          it opened a menu in the opposite corner of the window. */}
      <div className="app-region-no-drag flex h-full items-center">
        <Chrome label="Minimize" size="wide" onClick={() => void wc.minimize()}>
          <Icon d={paths.minimize} size={14} />
        </Chrome>
        <Chrome
          label={isMaximized ? "Restore" : "Maximize"}
          size="wide"
          onClick={() => {
            void wc.toggleMaximize().then((maximized) => setIsMaximized(maximized));
          }}
        >
          <Icon d={isMaximized ? paths.restore : paths.maximize} size={13} />
        </Chrome>
        <Chrome
          label="Close"
          size="wide"
          className="hover:bg-err/80 hover:text-white"
          onClick={() => void wc.close()}
        >
          <Icon d={paths.x} size={14} />
        </Chrome>
      </div>
    </header>
  );
}
