"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("conxaExecute", {
  runtimeStatus: () => ipcRenderer.invoke("runtime:status"),
  listSkills: () => ipcRenderer.invoke("skills:list"),
  getInputs: (payload) => ipcRenderer.invoke("skills:inputs", payload),
  execute: (payload) => ipcRenderer.invoke("skills:execute", payload),
  history: () => ipcRenderer.invoke("history:list"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (payload) => ipcRenderer.invoke("settings:save", payload),
  chatSend: (payload) => ipcRenderer.invoke("chat:send", payload),
});
