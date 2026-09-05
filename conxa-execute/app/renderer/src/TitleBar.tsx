import { useEffect, useState, type ReactNode } from "react";
import { Icon, paths } from "./ui";

function TitleButton({
  label,
  onClick,
  disabled,
  children,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`app-region-no-drag flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}

function WindowButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`app-region-no-drag flex h-9 w-11 items-center justify-center text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg ${className}`}
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
  initials: string;
  onProfile: () => void;
};

export function TitleBar({
  onToggleSidebar,
  onMenu,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  initials,
  onProfile,
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
        <TitleButton label="Menu" onClick={onMenu}>
          <Icon d={paths.menu} size={16} />
        </TitleButton>
        <TitleButton label="Toggle sidebar" onClick={onToggleSidebar}>
          <Icon d={paths.panel} size={16} />
        </TitleButton>
        <TitleButton label="Back" onClick={onBack} disabled={!canGoBack}>
          <Icon d={paths.back} size={16} />
        </TitleButton>
        <TitleButton label="Forward" onClick={onForward} disabled={!canGoForward}>
          <Icon d={paths.forward} size={16} />
        </TitleButton>
      </div>

      <div className="min-w-0 flex-1" />

      <div className="app-region-no-drag flex h-full items-center">
        <button
          type="button"
          aria-label="Account"
          onClick={onProfile}
          className="mx-1 flex h-7 w-7 items-center justify-center rounded-full bg-bg-active text-[11px] font-medium text-fg"
        >
          {initials}
        </button>
        <WindowButton label="Minimize" onClick={() => void wc.minimize()}>
          <Icon d={paths.minimize} size={14} />
        </WindowButton>
        <WindowButton
          label={isMaximized ? "Restore" : "Maximize"}
          onClick={() => {
            void wc.toggleMaximize().then((maximized) => setIsMaximized(maximized));
          }}
        >
          <Icon d={isMaximized ? paths.restore : paths.maximize} size={13} />
        </WindowButton>
        <WindowButton
          label="Close"
          className="hover:bg-err/80 hover:text-white"
          onClick={() => void wc.close()}
        >
          <Icon d={paths.x} size={14} />
        </WindowButton>
      </div>
    </header>
  );
}
