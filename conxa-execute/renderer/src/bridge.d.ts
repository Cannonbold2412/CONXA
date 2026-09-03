/// <reference types="vite/client" />

export type SkillRow = {
  skill: string;
  workspace_id?: string;
  name?: string;
  description?: string;
  inputs_required?: string[];
};

export type HistoryRow = {
  at: string;
  skill?: string;
  status: string;
  run_id?: string | null;
  message?: string;
  via?: string;
};

export type Bridge = {
  runtimeStatus: () => Promise<{ ok: boolean; command?: string; message?: string }>;
  listSkills: () => Promise<{ ok: boolean; skills?: SkillRow[]; message?: string }>;
  getInputs: (p: { skill: string; workspace_id?: string }) => Promise<{ ok: boolean; schema?: Record<string, unknown>; raw?: string; message?: string }>;
  execute: (p: { skill: string; workspace_id?: string; inputs: Record<string, string> }) => Promise<{ ok: boolean; status?: string; run_id?: string | null; text?: string; message?: string }>;
  history: () => Promise<{ ok: boolean; items?: HistoryRow[] }>;
  getSettings: () => Promise<{ ok: boolean; baseURL?: string; model?: string; hasKey?: boolean }>;
  saveSettings: (p: { baseURL?: string; model?: string; apiKey?: string }) => Promise<{ ok: boolean; hasKey?: boolean; message?: string }>;
  chatSend: (p: { text: string; messages?: { role: string; content: string }[] }) => Promise<{ ok: boolean; text?: string; message?: string }>;
};

declare global {
  interface Window {
    conxaExecute: Bridge;
  }
}

export {};
