/// <reference types="vite/client" />

export type SkillRow = {
  skill: string;
  workspace_id?: string;
  name?: string;
  description?: string;
};

export type HistoryRow = {
  at: string;
  skill?: string;
  status: string;
  run_id?: string | null;
  message?: string;
};

export type ChatMessage = { role: string; content: string; thinking?: string };

export type ChatDelta = { requestId: string; type: "text" | "reasoning"; text: string };

export type ConfirmRun = { id: string; requestId?: string; skill?: string; inputs: Record<string, unknown> };

export type SessionSummary = { id: string; title: string; createdAt: string; updatedAt: string };

export type SessionDetail = SessionSummary & { messages: ChatMessage[] };

export type Identity = { user_id: string; name?: string; email?: string };

export type PanelRect = { x: number; y: number; width: number; height: number };

export type PanelTab = { id: string; active: boolean };

export type ExecuteContext = {
  workspace_id: string;
  workspace_name: string;
  kind: "personal" | "member" | "grant";
  credits_remaining?: number | null;
};

export type UpdateCheckResult = { available: boolean; currentVersion: string; latestVersion?: string; error?: string };

export type UpdateStatus =
  | { phase: "download-progress"; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { phase: "downloaded" }
  | { phase: "error"; message: string };

export type Bridge = {
  runtimeStatus: () => Promise<{ ok: boolean; command?: string; message?: string }>;
  listSkills: () => Promise<{ ok: boolean; skills?: SkillRow[]; message?: string }>;
  getInputs: (p: { skill: string; workspace_id?: string }) => Promise<{ ok: boolean; schema?: Record<string, unknown>; message?: string }>;
  execute: (p: { skill: string; workspace_id?: string; inputs: Record<string, string> }) => Promise<{ ok: boolean; status?: string; run_id?: string | null; text?: string; message?: string }>;
  history: () => Promise<{ ok: boolean; items?: HistoryRow[] }>;
  deleteHistory: (p: { at: string }) => Promise<{ ok: boolean; items?: HistoryRow[]; message?: string }>;
  getSettings: () => Promise<{ ok: boolean; activeWorkspaceId?: string; error?: string }>;
  update: {
    check: () => Promise<UpdateCheckResult>;
    install: () => Promise<void>;
    getVersion: () => Promise<string>;
    onStatus: (cb: (p: UpdateStatus) => void) => () => void;
  };
  chatSend: (p: { text: string; sessionId: string; requestId?: string }) => Promise<{ ok: boolean; text?: string; message?: string }>;
  onChatDelta: (cb: (p: ChatDelta) => void) => () => void;
  onConfirmRun: (cb: (p: ConfirmRun) => void) => () => void;
  confirmRunReply: (p: { id: string; approved: boolean }) => Promise<{ ok: boolean }>;
  listSessions: () => Promise<{ ok: boolean; sessions?: SessionSummary[]; message?: string }>;
  createSession: () => Promise<{ ok: boolean; session?: SessionSummary; message?: string }>;
  loadSession: (p: { id: string }) => Promise<{ ok: boolean; session?: SessionDetail; message?: string }>;
  deleteSession: (p: { id: string }) => Promise<{ ok: boolean; message?: string }>;
  authLogin: () => Promise<{ ok: boolean; identity?: Identity; code?: string; message?: string }>;
  authLogout: () => Promise<{ ok: boolean }>;
  authStatus: () => Promise<{ ok: boolean; signedIn: boolean; identity?: Identity | null }>;
  getContexts: () => Promise<{ ok: boolean; contexts?: ExecuteContext[]; active_workspace_id?: string; message?: string }>;
  setContext: (p: { workspaceId: string }) => Promise<{ ok: boolean; activeWorkspaceId?: string; message?: string }>;
  openExternal: (p: { url: string }) => Promise<{ ok: boolean }>;
  panel: {
    setBounds: (p: { runId: string; tabId: string; rect: PanelRect }) => Promise<{ ok: boolean }>;
    selectTab: (p: { runId: string; tabId: string; rect?: PanelRect }) => Promise<{ ok: boolean }>;
    onTabsChanged: (cb: (p: { runId: string; tabs: PanelTab[] }) => void) => () => void;
  };
  windowControls: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
  };
};

declare global {
  interface Window {
    conxaExecute: Bridge;
  }
}

export {};
