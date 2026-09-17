"use strict";
const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

function settingsPath() {
  return path.join(app.getPath("userData"), "byo-settings.bin");
}

function loadSettings() {
  const p = settingsPath();
  if (!fs.existsSync(p)) return { activeWorkspaceId: "" };
  try {
    const buf = fs.readFileSync(p);
    if (!safeStorage.isEncryptionAvailable()) {
      return { activeWorkspaceId: "", error: "OS encryption is not available; settings were not loaded." };
    }
    const json = JSON.parse(safeStorage.decryptString(buf));
    return { activeWorkspaceId: String(json.activeWorkspaceId || "") };
  } catch (e) {
    return { activeWorkspaceId: "", error: e.message };
  }
}

function saveSettings({ activeWorkspaceId }) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS encryption is not available; settings were not saved.");
  }
  const prev = loadSettings();
  const next = { activeWorkspaceId: String(activeWorkspaceId || prev.activeWorkspaceId || "").trim() };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), safeStorage.encryptString(JSON.stringify(next)));
  return next;
}

function publicSettings() {
  const s = loadSettings();
  return { activeWorkspaceId: s.activeWorkspaceId, error: s.error || null };
}

module.exports = { loadSettings, saveSettings, publicSettings };
