"use strict";
/**
 * mcp_hosts.js — the AI-agent host registry. One row per host: how to detect
 * it, where its MCP config file(s) live, and what shape the entry takes.
 *
 * This is deliberately DATA, not code: adding a host is adding a row, never a
 * new function. Mirrors codebase-memory-mcp's agent_clients.c table (see
 * research-analysis/codebase-memory-mcp-auto-config-analysis.md).
 *
 * Windows-only for now (this installer targets Windows via NSIS). Rows are
 * shaped so a `detectMac`/`configPathsMac` pair can be added later without
 * touching the register/unregister orchestration in mcp_register.js.
 *
 * Detection is filesystem evidence only (directory/file existence + the
 * documented env-var overrides) — CLI-on-PATH probing (spawning `where <cmd>`)
 * is intentionally NOT replicated here.
 * (ponytail: one `where` spawn per undetected host is real cost for hosts
 * most machines don't have; add per-host if a customer's host is genuinely
 * missed by filesystem evidence alone.)
 * Paths below must be re-verified against each vendor's current docs before
 * shipping — these drift, and a wrong path is a silently unconfigured customer.
 *
 * `stability`:
 *   "stable"      — write whenever detect() is true (creates the config file
 *                   if it doesn't exist yet).
 *   "conditional" — write ONLY when a config file already proves the host is
 *                   active (never create the file to "activate" a host).
 *
 * `configPaths(ctx)` returns an ARRAY of paths — most hosts have exactly one,
 * but VS Code (per-profile mcp.json) and Cline (CLI + IDE settings) need more
 * than one file touched under the same host id.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}
function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}
function envOverride(name) {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

/** Shared filesystem context every host row's detect()/configPaths() receives. */
function buildContext() {
  const home = os.homedir();
  return {
    home,
    appData: process.env.APPDATA || path.join(home, "AppData", "Roaming"),
    localAppData: process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
  };
}

/**
 * Claude Desktop's config path. The Microsoft Store build virtualizes AppData
 * under LOCALAPPDATA\Packages\Claude_*; everything else uses the standard
 * %APPDATA%\Claude path. Ported from setup.nsi.tmpl (pre-Phase-1 history).
 */
function claudeDesktopConfigPath(ctx) {
  try {
    const packagesDir = path.join(ctx.localAppData, "Packages");
    const storeDir = fs.readdirSync(packagesDir, { withFileTypes: true })
      .find((e) => e.isDirectory() && e.name.startsWith("Claude_"));
    if (storeDir) {
      return path.join(packagesDir, storeDir.name, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json");
    }
  } catch (_) { /* no Packages dir — not a Store install */ }
  return path.join(ctx.appData, "Claude", "claude_desktop_config.json");
}

/** Claude Code honors $CLAUDE_CONFIG_DIR for the directory containing .claude.json. */
function claudeUserRoot(ctx) {
  return envOverride("CLAUDE_CONFIG_DIR") || ctx.home;
}

function vscodeUserDir(ctx) {
  return path.join(ctx.appData, "Code", "User");
}
/** The default mcp.json plus one per existing named profile (#431 in cbm). */
function vscodeConfigPaths(ctx) {
  const userDir = vscodeUserDir(ctx);
  const paths = [path.join(userDir, "mcp.json")];
  const profilesDir = path.join(userDir, "profiles");
  try {
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) paths.push(path.join(profilesDir, entry.name, "mcp.json"));
    }
  } catch (_) { /* no profiles dir — just the default file */ }
  return paths;
}

function clineDataDir(ctx) {
  return envOverride("CLINE_DATA_DIR") || path.join(ctx.home, ".cline", "data");
}
function clineConfigPaths(ctx) {
  return [
    path.join(ctx.home, ".cline", "mcp.json"),
    path.join(clineDataDir(ctx), "settings", "cline_mcp_settings.json"),
  ];
}

function copilotHome(ctx) {
  return envOverride("COPILOT_HOME") || path.join(ctx.home, ".copilot");
}
function opencodeConfigDir(ctx) {
  return path.join(ctx.home, ".config", "opencode");
}
function opencodeConfigPath(ctx) {
  return envOverride("OPENCODE_CONFIG") || path.join(opencodeConfigDir(ctx), "opencode.json");
}
function openclawConfigPath(ctx) {
  return envOverride("OPENCLAW_CONFIG_PATH") || path.join(ctx.home, ".openclaw", "openclaw.json");
}
function kiroHome(ctx) {
  return envOverride("KIRO_HOME") || path.join(ctx.home, ".kiro");
}
function qwenHome(ctx) {
  return envOverride("QWEN_HOME") || path.join(ctx.home, ".qwen");
}

const HOSTS = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    stability: "stable",
    detect: (ctx) => dirExists(path.dirname(claudeDesktopConfigPath(ctx))) || dirExists(path.join(ctx.appData, "Claude")),
    configPaths: (ctx) => [claudeDesktopConfigPath(ctx)],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    // Conditional: only ever update ~/.claude.json if it already exists —
    // matches the current NSIS behavior (never create it).
    stability: "conditional",
    detect: (ctx) => fileExists(path.join(claudeUserRoot(ctx), ".claude.json")),
    configPaths: (ctx) => [path.join(claudeUserRoot(ctx), ".claude.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "cursor",
    name: "Cursor",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".cursor")),
    configPaths: (ctx) => [path.join(ctx.home, ".cursor", "mcp.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "vscode",
    name: "VS Code",
    stability: "stable",
    detect: (ctx) => dirExists(vscodeUserDir(ctx)),
    configPaths: vscodeConfigPaths,
    objectPath: ["servers"],
    shape: "stdio",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".codeium", "windsurf")),
    configPaths: (ctx) => [path.join(ctx.home, ".codeium", "windsurf", "mcp_config.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    // Conditional: settings.json is Gemini's own first-run artifact — its
    // presence is the only filesystem evidence we have without CLI probing.
    stability: "conditional",
    detect: (ctx) => fileExists(path.join(ctx.home, ".gemini", "settings.json")),
    configPaths: (ctx) => [path.join(ctx.home, ".gemini", "settings.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "cline",
    name: "Cline",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".cline")) || dirExists(clineDataDir(ctx)),
    configPaths: clineConfigPaths,
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "zed",
    name: "Zed",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.appData, "Zed")),
    configPaths: (ctx) => [path.join(ctx.appData, "Zed", "settings.json")],
    objectPath: ["context_servers"],
    shape: "standard",
  },
  {
    id: "copilot-cli",
    name: "GitHub Copilot CLI",
    stability: "stable",
    detect: (ctx) => dirExists(copilotHome(ctx)),
    configPaths: (ctx) => [path.join(copilotHome(ctx), "mcp-config.json")],
    objectPath: ["mcpServers"],
    shape: "local",
  },
  {
    id: "factory",
    name: "Factory Droid",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".factory")),
    configPaths: (ctx) => [path.join(ctx.home, ".factory", "mcp.json")],
    objectPath: ["mcpServers"],
    shape: "stdio",
  },
  {
    id: "kilocode",
    name: "KiloCode",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".config", "kilo")),
    configPaths: (ctx) => [path.join(ctx.home, ".config", "kilo", "kilo.jsonc")],
    objectPath: ["mcp"],
    shape: "local-array",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".gemini", "antigravity-cli")),
    configPaths: (ctx) => [path.join(ctx.home, ".gemini", "config", "mcp_config.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "opencode",
    name: "OpenCode",
    stability: "stable",
    // An $OPENCODE_CONFIG override is trusted only once its target actually
    // exists on disk — same "never guess a host into existence" rule as
    // every other row, env override or not.
    detect: (ctx) => dirExists(opencodeConfigDir(ctx)) ||
      fileExists(opencodeConfigPath(ctx)) || dirExists(path.dirname(opencodeConfigPath(ctx))),
    configPaths: (ctx) => [opencodeConfigPath(ctx)],
    objectPath: ["mcp"],
    shape: "local-array",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    stability: "stable",
    detect: (ctx) => fileExists(openclawConfigPath(ctx)) || dirExists(path.dirname(openclawConfigPath(ctx))) ||
      dirExists(path.join(ctx.home, ".openclaw")),
    configPaths: (ctx) => [openclawConfigPath(ctx)],
    objectPath: ["mcp", "servers"],
    shape: "standard",
  },
  {
    id: "crush",
    name: "Crush",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".config", "crush")),
    configPaths: (ctx) => [path.join(ctx.home, ".config", "crush", "crush.json")],
    objectPath: ["mcp"],
    shape: "stdio",
  },
  {
    id: "openhands",
    name: "OpenHands",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".openhands")),
    configPaths: (ctx) => [path.join(ctx.home, ".openhands", "mcp.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "augment",
    name: "Augment",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".augment")),
    configPaths: (ctx) => [path.join(ctx.home, ".augment", "settings.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "kiro",
    name: "Kiro",
    stability: "stable",
    detect: (ctx) => dirExists(kiroHome(ctx)),
    configPaths: (ctx) => [path.join(kiroHome(ctx), "settings", "mcp.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "junie",
    name: "Junie",
    stability: "stable",
    detect: (ctx) => dirExists(path.join(ctx.home, ".junie")),
    configPaths: (ctx) => [path.join(ctx.home, ".junie", "mcp", "mcp.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    stability: "stable",
    detect: (ctx) => dirExists(qwenHome(ctx)),
    configPaths: (ctx) => [path.join(qwenHome(ctx), "settings.json")],
    objectPath: ["mcpServers"],
    shape: "standard",
  },
];

module.exports = {
  HOSTS,
  buildContext,
  dirExists,
  fileExists,
  claudeDesktopConfigPath,
  claudeUserRoot,
  vscodeConfigPaths,
  clineConfigPaths,
};
