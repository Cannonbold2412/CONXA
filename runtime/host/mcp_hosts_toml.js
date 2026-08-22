"use strict";
/**
 * mcp_hosts_toml.js — the two TOML-configured hosts (Codex CLI, Mistral
 * Vibe). Kept separate from mcp_hosts.js because TOML editing is a different
 * shape entirely (config_edit_toml.js's marker-block engine, not
 * config_edit.js's JSON path editor) — see that file for why the two hosts
 * below need different `isForeign` checks.
 *
 * Windows-only, same filesystem-evidence-only detection as mcp_hosts.js.
 * Paths must be re-verified against each vendor's current docs before
 * shipping.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { tomlEscapeString, outsideOwnSpan, markerStart } = require("./config_edit_toml");

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}
function envOverride(name) {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

function buildContext() {
  const home = os.homedir();
  return { home };
}

function codexHome(ctx) {
  return envOverride("CODEX_HOME") || path.join(ctx.home, ".codex");
}
function vibeHome(ctx) {
  return envOverride("VIBE_HOME") || path.join(ctx.home, ".vibe");
}

const TOML_HOSTS = [
  {
    id: "codex",
    name: "Codex CLI",
    // Marker label is keyed by identity.key (conxa vs conxa-dev), NOT a
    // static string — dev and prod each need their own marker span so a
    // dev-channel registration doesn't overwrite the prod one's span (they
    // coexist as two distinct object keys for the JSON hosts; TOML needs the
    // equivalent via two distinct marker-labeled spans).
    label: (identity) => identity.key,
    detect: (ctx) => dirExists(codexHome(ctx)),
    configPath: (ctx) => path.join(codexHome(ctx), "config.toml"),
    // A regular table can exist only once — a second [mcp_servers.<key>]
    // header anywhere outside our span means someone else already owns it.
    build: (identity) => {
      const headerLine = `[mcp_servers.${identity.key}]`;
      const blockBody = [
        headerLine,
        `command = "${tomlEscapeString(identity.commandPath)}"`,
        "args = []",
      ].join("\n");
      return {
        blockBody,
        isForeign: (outside) => outside.split("\n").some((l) => l.trim() === headerLine),
      };
    },
  },
  {
    id: "vibe",
    name: "Mistral Vibe",
    label: (identity) => identity.key,
    detect: (ctx) => dirExists(vibeHome(ctx)),
    configPath: (ctx) => path.join(vibeHome(ctx), "config.toml"),
    // [[mcp_servers]] legitimately repeats once per server — every OTHER
    // server on the host shares the identical header line, so the only real
    // conflict is another array entry whose own `name` already claims ours.
    build: (identity) => {
      const blockBody = [
        "[[mcp_servers]]",
        `name = "${tomlEscapeString(identity.key)}"`,
        'transport = "stdio"',
        `command = "${tomlEscapeString(identity.commandPath)}"`,
        "args = []",
      ].join("\n");
      const nameLine = `name = "${identity.key}"`;
      return {
        blockBody,
        isForeign: (outside) => outside.split(/\n\s*\[\[/).some((chunk) =>
          chunk.split("\n").some((l) => l.trim() === nameLine)),
      };
    },
  },
];

module.exports = { TOML_HOSTS, buildContext, codexHome, vibeHome, outsideOwnSpan, markerStart };
