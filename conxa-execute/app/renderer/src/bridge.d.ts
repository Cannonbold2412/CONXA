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

export type ChatMode = "byok" | "topup" | "subscription" | "workspace_pool";

export type ChatMessage = { role: string; content: string };

export type SessionSummary = { id: string; title: string; createdAt: string; updatedAt: string };

export type SessionDetail = SessionSummary & { messages: ChatMessage[] };

export type Identity = { user_id: string; name?: string; email?: string };

export type PanelRect = { x: number; y: number; width: number; height: number };

export type PanelTab = { id: string; active: boolean };

export type Entitlement = {
  mode: "subscription" | "topup" | "none" | "workspace_pool";
  plan_id?: string;
  quota_used?: number;
  quota_total?: number;
  topup_balance?: number;
  workspace_name?: string;
  remaining?: number | null;
};

export type Bridge = {
  runtimeStatus: () => Promise<{ ok: boolean; command?: string; message?: string }>;
  listSkills: () => Promise<{ ok: boolean; skills?: SkillRow[]; message?: string }>;
  getInputs: (p: { skill: string; workspace_id?: string }) => Promise<{ ok: boolean; schema?: Record<string, unknown>; message?: string }>;
  execute: (p: { skill: string; workspace_id?: string; inputs: Record<string, string> }) => Promise<{ ok: boolean; status?: string; run_id?: string | null; text?: string; message?: string }>;
  history: () => Promise<{ ok: boolean; items?: HistoryRow[] }>;
  deleteHistory: (p: { at: string }) => Promise<{ ok: boolean; items?: HistoryRow[]; message?: string }>;
  getSettings: () => Promise<{ ok: boolean; baseURL?: string; model?: string; hasKey?: boolean; mode?: ChatMode; error?: string }>;
  saveSettings: (p: { baseURL?: string; model?: string; apiKey?: string; mode?: ChatMode }) => Promise<{ ok: boolean; hasKey?: boolean; mode?: ChatMode; message?: string }>;
  chatSend: (p: { text: string; sessionId: string }) => Promise<{ ok: boolean; text?: string; message?: string }>;
  listSessions: () => Promise<{ ok: boolean; sessions?: SessionSummary[]; message?: string }>;
  createSession: () => Promise<{ ok: boolean; session?: SessionSummary; message?: string }>;
  loadSession: (p: { id: string }) => Promise<{ ok: boolean; session?: SessionDetail; message?: string }>;
  deleteSession: (p: { id: string }) => Promise<{ ok: boolean; message?: string }>;
  authLogin: () => Promise<{ ok: boolean; identity?: Identity; code?: string; message?: string }>;
  authLogout: () => Promise<{ ok: boolean }>;
  authStatus: () => Promise<{ ok: boolean; signedIn: boolean; identity?: Identity | null }>;
  getEntitlement: () => Promise<{ ok: boolean; entitlement?: Entitlement; plansUrl?: string; message?: string }>;
  redeemGrant: (p: { grantId: string }) => Promise<{ ok: boolean; workspaceName?: string; message?: string }>;
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
