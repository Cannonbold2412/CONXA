"use strict";
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function historyPath() {
  return path.join(app.getPath("userData"), "run-history.json");
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(historyPath(), "utf8"));
  } catch {
    return [];
  }
}

function pushHistory(entry) {
  const list = loadHistory();
  list.unshift(entry);
  fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
  fs.writeFileSync(historyPath(), JSON.stringify(list.slice(0, 50), null, 2));
  return list.slice(0, 50);
}

function deleteHistoryEntry(at) {
  const list = loadHistory().filter((e) => e.at !== at);
  fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
  fs.writeFileSync(historyPath(), JSON.stringify(list, null, 2));
  return list;
}

module.exports = { loadHistory, pushHistory, deleteHistoryEntry };
