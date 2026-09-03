"use strict";
/**
 * Conxa Execute — Electron main process.
 * Window + IPC only. No Python backend, no recorder, no electron-updater (v0.1).
 */

const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const mcp = require("./mcp_client");
const settings = require("./settings");
const history = require("./history");
const { runTurn } = require("../vendor/opencode/loop/run_turn");

const IS_DEV = !app.isPackaged;
process.env.CONXA_ELECTRON_IS_PACKAGED = app.isPackaged ? "1" : "0";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#141413",
    title: "Conxa Execute",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (IS_DEV && process.env.CONXA_RENDERER_URL) {
    mainWindow.loadURL(process.env.CONXA_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "dist", "index.html"));
  }

  if (IS_DEV) {
    mainWindow.webContents.on("before-input-event", (_event, input) => {
      const isToggle =
        input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i");
      if (isToggle) mainWindow.webContents.toggleDevTools();
    });
  }
}

function fail(code, message) {
  return { ok: false, code, message };
}

ipcMain.handle("runtime:status", () => {
  const cmd = mcp.resolveRuntimeCommand();
  return cmd
    ? { ok: true, command: cmd.command }
    : fail("runtime_missing", "Conxa runtime is not installed. Form and chat will not hang — install a skill pack first.");
});

ipcMain.handle("skills:list", async () => {
  try {
    return await mcp.listSkills();
  } catch (e) {
    return fail(e.code || "mcp_error", e.message);
  }
});

ipcMain.handle("skills:inputs", async (_e, payload) => {
  try {
    return await mcp.getSkillInputs(payload.skill, payload.workspace_id);
  } catch (e) {
    return fail(e.code || "mcp_error", e.message);
  }
});

ipcMain.handle("skills:execute", async (_e, payload) => {
  try {
    const result = await mcp.executeSkill(payload);
    history.pushHistory({
      at: new Date().toISOString(),
      skill: payload.skill,
      workspace_id: payload.workspace_id || null,
      status: result.status,
      run_id: result.run_id,
      message: String(result.text || "").trim().slice(0, 300),
    });
    return result;
  } catch (e) {
    return fail(e.code || "mcp_error", e.message);
  }
});

ipcMain.handle("history:list", () => ({ ok: true, items: history.loadHistory() }));

ipcMain.handle("settings:get", () => ({ ok: true, ...settings.publicSettings() }));

ipcMain.handle("settings:save", (_e, payload) => {
  try {
    return { ok: true, ...settings.saveSettings(payload || {}) };
  } catch (e) {
    return fail("settings_error", e.message);
  }
});

const SYSTEM_PROMPT = `You are Conxa Execute. You only run recorded Conxa skills on this machine.

Rules:
- Use list_skills, get_skill_inputs, then execute_skill. Nothing else.
- Fill declared skill inputs from the user. Do not invent secret values.
- If a run fails, read the failure text. Recovery (self-heal) happens inside the skill runtime; you may retry execute_skill with resume_from / step_overrides only when the failure text asks for them.
- Do not run a shell, edit files, or browse the web yourself. There is no bash or write tool.
- execute_skill already opens a visible browser (watch true).`;

ipcMain.handle("chat:send", async (_e, payload) => {
  const pub = settings.publicSettings();
  const full = settings.loadSettings();
  if (!full.apiKey) {
    return fail("no_byo_key", "Chat needs your own API key. Form still works — open Settings, paste a key and base URL.");
  }
  if (!mcp.resolveRuntimeCommand()) {
    return fail("runtime_missing", "Conxa runtime is not installed.");
  }
  try {
    const tools = await mcp.listChatTools();
    const result = await runTurn({
      baseURL: full.baseURL || "https://api.openai.com/v1",
      apiKey: full.apiKey,
      model: full.model || "gpt-4o-mini",
      system: SYSTEM_PROMPT,
      messages: Array.isArray(payload.messages) ? payload.messages : [{ role: "user", content: String(payload.text || "") }],
      tools,
      executeTool: async (name, args) => {
        if (name === "execute_skill") {
          args = { ...args, watch: true };
        }
        const text = await mcp.callTool(name, args);
        if (name === "execute_skill") {
          history.pushHistory({
            at: new Date().toISOString(),
            skill: args.skill,
            workspace_id: args.workspace_id || null,
            status: mcp.classifyRunResult(text),
            run_id: mcp.extractRunId(text),
            message: String(text || "").trim().slice(0, 300),
            via: "chat",
          });
        }
        return text;
      },
    });
    if (!result.ok) return fail("model_error", result.error);
    return { ok: true, text: result.text, settingsHint: pub.hasKey };
  } catch (e) {
    return fail(e.code || "chat_error", e.message);
  }
});

app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => {
  mcp.stopEngine().finally(() => app.quit());
});
