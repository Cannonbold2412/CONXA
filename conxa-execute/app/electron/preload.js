"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("conxaExecute", {
  runtimeStatus: () => ipcRenderer.invoke("runtime:status"),
  listSkills: () => ipcRenderer.invoke("skills:list"),
  getInputs: (payload) => ipcRenderer.invoke("skills:inputs", payload),
  execute: (payload) => ipcRenderer.invoke("skills:execute", payload),
  history: () => ipcRenderer.invoke("history:list"),
  deleteHistory: (payload) => ipcRenderer.invoke("history:delete", payload),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (payload) => ipcRenderer.invoke("settings:save", payload),
  chatSend: (payload) => ipcRenderer.invoke("chat:send", payload),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  createSession: () => ipcRenderer.invoke("sessions:create"),
  loadSession: (payload) => ipcRenderer.invoke("sessions:load", payload),
  deleteSession: (payload) => ipcRenderer.invoke("sessions:delete", payload),
  authLogin: () => ipcRenderer.invoke("auth:login"),
  authLogout: () => ipcRenderer.invoke("auth:logout"),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  getEntitlement: () => ipcRenderer.invoke("account:entitlement"),
  openExternal: (payload) => ipcRenderer.invoke("shell:openExternal", payload),
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizeChange: (cb) => {
      const listener = (_e, maximized) => cb(Boolean(maximized));
      ipcRenderer.on("window:maximized", listener);
      return () => ipcRenderer.removeListener("window:maximized", listener);
    },
  },
});
