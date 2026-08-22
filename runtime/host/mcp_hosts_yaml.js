"use strict";
/**
 * mcp_hosts_yaml.js — the two YAML-configured hosts (Goose, Hermes). Kept
 * separate from mcp_hosts.js because YAML editing is a different shape
 * (config_edit_yaml.js's Document API, not config_edit.js's JSON path
 * editor).
 *
 * Windows-only, same filesystem-evidence-only detection as mcp_hosts.js.
 * Paths must be re-verified against each vendor's current docs before
 * shipping.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}
function envOverride(name) {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

function buildContext() {
  const home = os.homedir();
  return { home, appData: process.env.APPDATA || path.join(home, "AppData", "Roaming") };
}

function hermesHome(ctx) {
  return envOverride("HERMES_HOME") || path.join(ctx.home, ".hermes");
}

const YAML_HOSTS = [
  {
    id: "goose",
    name: "Goose",
    detect: (ctx) => dirExists(path.join(ctx.appData, "Block", "goose")),
    configPath: (ctx) => path.join(ctx.appData, "Block", "goose", "config", "config.yaml"),
    yamlPath: (identity) => ["extensions", identity.key],
    build: (identity) => ({ type: "stdio", cmd: identity.commandPath, args: [], enabled: true }),
  },
  {
    id: "hermes",
    name: "Hermes",
    detect: (ctx) => dirExists(hermesHome(ctx)),
    configPath: (ctx) => path.join(hermesHome(ctx), "config.yaml"),
    yamlPath: (identity) => ["mcp_servers", identity.key],
    build: (identity) => ({ command: identity.commandPath }),
  },
];

module.exports = { YAML_HOSTS, buildContext, hermesHome };
