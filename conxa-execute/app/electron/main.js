"use strict";
/**
 * Conxa Execute — Electron main process.
 * Window + IPC only. No Python backend, no recorder, no electron-updater (v0.1).
 */

const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const net = require("net");
const path = require("path");
const mcp = require("./mcp_client");
const settings = require("./settings");
const history = require("./history");
const sessionsStore = require("./sessions");
const authService = require("./auth_service");
const executeClient = require("./execute_client");
const browserPanel = require("./browser_panel");
const browserControl = require("./browser_control");
const compaction = require("../vendor/opencode/session/compaction");
const { runTurn } = require("../vendor/opencode/loop/run_turn");

const IS_DEV = !app.isPackaged;
process.env.CONXA_ELECTRON_IS_PACKAGED = app.isPackaged ? "1" : "0";

// Ask the OS for an unused loopback port before Electron reads command line switches —
// --remote-debugging-port needs a concrete number, not 0 (Electron doesn't surface the
// auto-assigned port anywhere reachable from this process). Async because a listening
// socket only actually has a port once the "listening" event fires, not the instant
// .listen() returns — but appendSwitch only needs to land before app.whenReady()
// resolves, so awaiting this ahead of that call is enough.
function _freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}
let _CDP_PORT = null;
const _cdpPortReady = _freePort().then((port) => {
  _CDP_PORT = port;
  app.commandLine.appendSwitch("remote-debugging-port", String(port));
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function createWindow() {
  const buildDir = path.join(__dirname, "..", "build");
  const iconPath = process.platform === "win32"
    ? path.join(buildDir, "icon.ico")
    : path.join(buildDir, "icon.png");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#141413",
    title: "CONXA",
    icon: iconPath,
    frame: false,
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

  const sendMaximizeState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("window:maximized", mainWindow.isMaximized());
  };
  mainWindow.on("maximize", sendMaximizeState);
  mainWindow.on("unmaximize", sendMaximizeState);

  browserPanel.init(mainWindow, {
    onTabsChanged: (runId, tabs) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("panel:tabs", { runId, tabs });
      }
    },
  });
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

ipcMain.handle("history:delete", (_e, payload) => {
  try {
    const items = history.deleteHistoryEntry(payload.at);
    return { ok: true, items };
  } catch (e) {
    return fail("history_error", e.message);
  }
});

ipcMain.handle("settings:get", () => ({ ok: true, ...settings.publicSettings() }));

ipcMain.handle("settings:save", (_e, payload) => {
  try {
    return { ok: true, ...settings.saveSettings(payload || {}) };
  } catch (e) {
    return fail("settings_error", e.message);
  }
});

ipcMain.handle("sessions:list", async () => {
  try {
    return { ok: true, sessions: await sessionsStore.listSessions() };
  } catch (e) {
    return fail(e.code || "sessions_error", e.message);
  }
});

ipcMain.handle("sessions:create", async () => {
  try {
    return { ok: true, session: await sessionsStore.createSession() };
  } catch (e) {
    return fail(e.code || "sessions_error", e.message);
  }
});

ipcMain.handle("sessions:load", async (_e, payload) => {
  try {
    return { ok: true, session: await sessionsStore.loadSession(payload.id) };
  } catch (e) {
    return fail(e.code || "sessions_error", e.message);
  }
});

ipcMain.handle("sessions:delete", async (_e, payload) => {
  try {
    await sessionsStore.deleteSession(payload.id);
    return { ok: true };
  } catch (e) {
    return fail(e.code || "sessions_error", e.message);
  }
});

ipcMain.handle("auth:login", async () => {
  try {
    return { ok: true, identity: await authService.login() };
  } catch (e) {
    return fail(e.code || "auth_error", e.message);
  }
});

ipcMain.handle("auth:logout", () => {
  authService.logout();
  return { ok: true };
});

ipcMain.handle("auth:status", async () => {
  const identity = await authService.currentIdentity();
  return { ok: true, signedIn: Boolean(identity), identity };
});

ipcMain.handle("account:entitlement", async () => {
  try {
    return {
      ok: true,
      entitlement: await executeClient.getEntitlement(),
      plansUrl: `${executeClient.baseUrl()}/plans`,
    };
  } catch (e) {
    return fail(e.code || "entitlement_error", e.message);
  }
});

ipcMain.handle("account:redeem-grant", async (_e, payload) => {
  const grantId = String(payload?.grantId || "").trim();
  if (!grantId) return fail("no_grant_id", "Paste an invite code first.");
  try {
    const result = await executeClient.claimGrant(grantId);
    // A claimed seat draws entirely from the granting workspace's pool — no
    // personal BYOK/topup/subscription fallback, so local chat routing must
    // switch away from whatever mode was previously saved.
    settings.saveSettings({ mode: "workspace_pool" });
    return { ok: true, workspaceName: result.workspace_name };
  } catch (e) {
    return fail(e.code || "claim_failed", e.message);
  }
});

ipcMain.handle("shell:openExternal", (_e, payload) => {
  shell.openExternal(String(payload?.url || ""));
  return { ok: true };
});

ipcMain.handle("window:minimize", (event) => {
  windowFromEvent(event)?.minimize();
});

ipcMain.handle("window:toggle-maximize", (event) => {
  const win = windowFromEvent(event);
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle("window:close", (event) => {
  windowFromEvent(event)?.close();
});

ipcMain.handle("window:is-maximized", (event) => Boolean(windowFromEvent(event)?.isMaximized()));

// The renderer draws the tab strip itself (real DOM — it has to sit outside whatever rect
// gets reported here, since a WebContentsView floats above regular page content and would
// occlude it) and reports only the empty rect below it. `rect` is in window-local, unscaled
// pixels — exactly what WebContentsView.setBounds expects — via a ResizeObserver on that
// placeholder element.
ipcMain.handle("panel:bounds", (_e, payload) => {
  const { runId, tabId, rect } = payload || {};
  if (!runId || !tabId || !rect) return { ok: false };
  browserPanel.setActiveBounds(runId, tabId, rect);
  return { ok: true };
});

ipcMain.handle("panel:select-tab", (_e, payload) => {
  const { runId, tabId, rect } = payload || {};
  if (!runId || !tabId) return { ok: false };
  // Reuses setActiveBounds for the switch itself — selecting a tab and placing it are the
  // same operation (show this one at `rect`, hide every sibling), so there is no separate
  // "just make it active" path to keep in sync with the bounds one.
  browserPanel.setActiveBounds(runId, tabId, rect || { x: 0, y: 0, width: 0, height: 0 });
  return { ok: true };
});

const SYSTEM_PROMPT = `You are CONXA. You only run recorded Conxa skills on this machine.

Rules:
- Use list_skills, get_skill_inputs, then execute_skill. Nothing else.
- Fill declared skill inputs from the user. Do not invent secret values.
- If a run fails, read the failure text. Recovery (self-heal) happens inside the skill runtime; you may retry execute_skill with resume_from / step_overrides only when the failure text asks for them.
- Do not run a shell, edit files, or browse the web yourself. There is no bash or write tool.
- execute_skill already opens a visible browser (watch true) — it renders in this app's own browser panel, not a separate window.`;

ipcMain.handle("chat:send", async (_e, payload) => {
  const full = settings.loadSettings();
  const mode = full.mode || "byok";
  const sessionId = payload.sessionId;
  if (!sessionId) {
    return fail("no_session", "No active chat session.");
  }
  if (!mcp.resolveRuntimeCommand()) {
    return fail("runtime_missing", "Conxa runtime is not installed.");
  }

  let baseURL, apiKey, model;
  if (mode === "byok") {
    if (!full.apiKey) {
      return fail("no_byo_key", "Chat needs your own API key. Form still works — open Settings, paste a key and base URL.");
    }
    baseURL = full.baseURL || "https://api.openai.com/v1";
    apiKey = full.apiKey;
    model = full.model || "gpt-4o-mini";
  } else {
    try {
      apiKey = await authService.getToken();
    } catch (e) {
      return fail("not_signed_in", "Sign in to CONXA in Settings to use this mode.");
    }
    baseURL = `${executeClient.baseUrl()}/v1`;
    model = "conxa-execute"; // advisory only — the backend picks the real provider/model per plan.
  }

  let priorMessages;
  try {
    priorMessages = (await sessionsStore.loadSession(sessionId)).messages;
  } catch (e) {
    return fail("session_error", e.message);
  }
  const nextMessages = compaction.pruneIfNeeded([
    ...priorMessages,
    { role: "user", content: String(payload.text || "") },
  ]);

  try {
    const tools = await mcp.listChatTools();
    const result = await runTurn({
      baseURL,
      apiKey,
      model,
      system: SYSTEM_PROMPT,
      messages: nextMessages,
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

    await sessionsStore.saveSessionMessages(sessionId, result.messages);
    if (mode !== "byok") {
      // ponytail: a sync-push failure shouldn't block the chat from working —
      // local storage (just written above) is already this device's source
      // of truth; the next successful sync catches it up.
      executeClient.updateSession(sessionId, result.messages).catch(() => {});
    }

    return { ok: true, text: result.text };
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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await _cdpPortReady; // must land before this point regardless — see _freePort's comment
  // The runtime (spawned lazily by mcp_client.js's ensureEngine, which forwards this
  // process's whole process.env) picks these two up with no further plumbing needed —
  // see host_browser.js on the runtime side for what each one is for. Set before
  // createWindow() so they're already present by the time anything can execute a skill.
  const { url: controlUrl } = await browserControl.start();
  process.env.CONXA_HOST_BROWSER_CDP = `http://127.0.0.1:${_CDP_PORT}`;
  process.env.CONXA_HOST_CONTROL_URL = controlUrl;
  createWindow();
});

app.on("window-all-closed", () => {
  browserControl.stop();
  mcp.stopEngine().finally(() => app.quit());
});
