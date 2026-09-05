"use strict";
const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

function settingsPath() {
  return path.join(app.getPath("userData"), "byo-settings.bin");
}

function loadSettings() {
  const p = settingsPath();
  if (!fs.existsSync(p)) return { baseURL: "", model: "", hasKey: false, mode: "byok" };
  try {
    const buf = fs.readFileSync(p);
    if (!safeStorage.isEncryptionAvailable()) {
      return {
        baseURL: "",
        model: "",
        hasKey: false,
        mode: "byok",
        error: "OS encryption is not available; chat key was not loaded.",
      };
    }
    const json = JSON.parse(safeStorage.decryptString(buf));
    return {
      baseURL: json.baseURL || "",
      model: json.model || "",
      hasKey: Boolean(json.apiKey),
      apiKey: json.apiKey || "",
      mode: json.mode === "topup" || json.mode === "subscription" ? json.mode : "byok",
    };
  } catch (e) {
    return { baseURL: "", model: "", hasKey: false, mode: "byok", error: e.message };
  }
}

function saveSettings({ baseURL, model, apiKey, mode }) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS encryption is not available; the API key was not saved.");
  }
  const prev = loadSettings();
  const next = {
    baseURL: String(baseURL || prev.baseURL || "").trim(),
    model: String(model || prev.model || "").trim(),
    apiKey: apiKey != null && apiKey !== "" ? String(apiKey) : prev.apiKey || "",
    mode: mode === "topup" || mode === "subscription" ? mode : mode === "byok" ? "byok" : prev.mode || "byok",
  };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), safeStorage.encryptString(JSON.stringify(next)));
  return { baseURL: next.baseURL, model: next.model, hasKey: Boolean(next.apiKey), mode: next.mode };
}

function publicSettings() {
  const s = loadSettings();
  return { baseURL: s.baseURL, model: s.model, hasKey: s.hasKey, mode: s.mode, error: s.error || null };
}

module.exports = { loadSettings, saveSettings, publicSettings };
