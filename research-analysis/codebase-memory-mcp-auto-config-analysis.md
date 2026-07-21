# Auto-configuring Conxa's MCP server across every AI agent host

**What this doc is:** a concrete implementation plan for making the Conxa installer register the Conxa MCP server into *every* agent host on a customer's machine — Claude Desktop, Claude Code, Cursor, VS Code/Copilot, Windsurf, Codex, Gemini CLI, Cline, Zed and more — the way `codebase-memory-mcp` (DeusData, C) does it for 43 clients.

**Why it matters:** today Conxa reaches customers who use Claude Desktop or Claude Code. Every other agent host is a customer we cannot sell to, no matter how good the skill pack is. This is a distribution multiplier, not a polish task.

Source studied: `research-analysis/repo/codebase-memory-mcp-main`, primarily `src/cli/cli.c`, `src/cli/agent_clients.c`, `src/cli/config_json_like.c`.

---

## 0. TL;DR — the five things to copy

1. **Move MCP registration out of the NSIS script and into the runtime binary** (`conxa-runtime.exe register-mcp`). NSIS just calls it. This is the enabling move; everything else depends on it.
2. **Make the client list a data table**, not code. One row per host: detect probe, config path, object path inside the config, entry shape. Adding Cursor becomes a 6-line row.
3. **Write surgically and atomically**: temp file → fsync → rename, never a whole-file reserialize over the live path.
4. **Fail closed on ownership**: if an entry under our key isn't one we wrote, refuse — never `-Force` over it.
5. **Ship discoverability with the registration** (a skill/instructions file per host), or the agent won't reach for our tools even though they're registered.

---

## 1. How codebase-memory-mcp does it

### 1.1 Two-stage install

`install.ps1` does only the dumb part: detect arch, download, verify `checksums.txt`, extract, copy to `%LOCALAPPDATA%\Programs\`, run `--version` to prove it executes, add to PATH. Then:

```powershell
& $Dest install -y     # the binary configures the agents, not the script
```

**The install script never touches an agent config file.** All config logic is inside the shipped binary (`cbm_cmd_install`, `cli.c:7545`). Consequences that matter to us:

- One implementation for all OSes and all hosts.
- The same code runs on first install, on upgrade, on repair, and when the user re-runs it by hand.
- It is unit-testable — `tests/test_agent_clients.c`, `test_config_json_like.c`, `test_config_text_edit.c` exist precisely because the logic isn't trapped in an installer script.

Install order (worth mirroring): preserve existing state unless explicitly reset → kill running server instances so hosts reload → place the binary at the canonical path → platform fixups (macOS ad-hoc re-sign, or a linker-signed arm64 binary gets `Killed: 9` when spawned by an MCP host) → detect agents → write configs → write durable context → ensure PATH.

### 1.2 Detection = filesystem evidence

`cbm_detect_agents()` (`cli.c:1488`) is a flat list of probes:

```c
agents.cursor   = dir_exists("$HOME/.cursor");
agents.gemini   = file_exists("$HOME/.gemini/settings.json") || cli_exists("gemini");
agents.windsurf = dir_exists("$HOME/.codeium/windsurf");
agents.vscode   = dir_exists(<platform Code/User dir>);
```

Rules:
- Config dir exists ⇒ client installed. No registry scan, no process scan.
- Env overrides win first: `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `OPENCODE_CONFIG`, `KIRO_HOME`, `OPENCLAW_CONFIG_PATH`, `XDG_CONFIG_HOME`.
- Clients graded `STABLE` / `CONDITIONAL` / `OPT_IN`. Conditional ones are written **only when a documented platform path or an already-existing config file proves the client is active** — never guessed into existence.

### 1.3 The write path — four properties, all non-negotiable

**Surgical, not reserialized.** Four dialect editors (`config_json_like.c` for JSON/JSONC/JSON5, `config_toml_edit.c`, `config_yaml_edit.c`, `config_text_edit.c`) each upsert *one entry at one object path*. Every other byte — comments, key order, indentation — survives.

**Ownership fail-closed** (`cbm_json_mcp_snapshot_ownership`, `cli.c:889`). Before writing, it matches the existing entry field-by-field against its own schema and requires `command` to be its own binary path (or bare name). A foreign entry under the same key ⇒ refuse (`CBM_AGENT_EDIT_FOREIGN`). Uninstall is symmetric: only removes an entry still byte-identical to what it wrote.

**Compare-and-swap.** The API is `upsert_entry_if_unchanged(path, …, expected_content, expected_length)` — the snapshot it inspected must still be the file's exact bytes at write time. Closes the read-modify-write race against a running host.

**Atomic, symlink-safe publish** (`config_json_like.c` ~1349–1630): rejects anything not a regular file with `st_nlink == 1` (symlinks and Windows reparse points fail closed); writes `<path>.cbm.tmp.<pid>.<n>` with `O_CREAT|O_EXCL|O_NOFOLLOW`; fsyncs the temp file *and the parent directory*; re-validates destination identity immediately before `rename()`; preserves owner/group/mode.

### 1.4 Registration alone isn't enough

Roughly 20% of `install` is MCP registration. The rest is **durable context** so the model actually uses the server: skills (`~/.claude/skills/…/SKILL.md`), instruction files (`AGENTS.md`, `GEMINI.md`, `QWEN.md`, Windsurf `global_rules.md`, `.goosehints`), tiered sub-agents with explicit tool allowlists, and hooks (`SessionStart` reminders, `PreToolUse` search augmentation).

The hook rule is structural and absolute: **it can never block a tool call.** Any error, timeout, or missing project ⇒ `exit 0` with empty stdout, guarded by an in-process hard deadline (default 2000 ms) plus the host's own timeout as an outer backstop.

### 1.5 Operator safety

`install --plan` prints a machine-readable receipt of every file it would touch and exits — no writes, no network. Plus `--dry-run`, `--force`, `--skip-config`, per-agent error accounting (one client failing doesn't abort the rest), symmetric uninstall for every surface, and legacy-path cleanup.

---

## 2. Where Conxa stands today

`installer_templates/setup.nsi.tmpl` §MCPRegistration generates a throwaway PowerShell script:

```powershell
$c = Get-Content $p -Raw | ConvertFrom-Json
if (-not $c.mcpServers) { $c | Add-Member mcpServers ([PSCustomObject]@{}) }
$c.mcpServers | Add-Member conxa $entry -Force
[System.IO.File]::WriteAllText($p, ($c | ConvertTo-Json -Depth 10), UTF8NoBOM)
```

Already right, keep it: Store-app path detection (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`), user-level `RequestExecutionLevel`, kill scoped to the Desktop app so it doesn't take down a Claude Code session, registering the stable `current` junction so self-updates never rewrite the config, `.claude.json` updated only if it already exists, manual-instructions fallback on failure.

Gaps:

| # | Gap | Consequence |
|---|---|---|
| G1 | Whole-file reserialize (`ConvertFrom-Json \| ConvertTo-Json -Depth 10`) | Key order and comments lost; anything deeper than 10 levels silently stringified. It's the customer's file, not ours. |
| G2 | Non-atomic `WriteAllText` over the live file | Crash mid-write ⇒ truncated `claude_desktop_config.json` ⇒ Claude Desktop won't start. Worst thing we can do to a customer. |
| G3 | `-Force` overwrite, no ownership check | Clobbers a foreign or second-install `conxa` entry silently. |
| G4 | **Uninstaller hardcodes `'conxa'`; installer writes `${MCP_SERVER}` = `conxa-dev` on dev channel** (`installer_builder.py:408`) | Dev-build uninstall leaves a dangling entry pointing at a deleted exe → permanently failing server in the host. **Live bug.** |
| G5 | No symlink/reparse guard, no read-modify-write CAS | Corruption if the host rewrites concurrently. |
| G6 | Two hosts only | Cursor / VS Code / Windsurf / Codex / Gemini / Cline / Zed customers cannot install a Conxa pack at all. |
| G7 | No durable context | Tools registered, but nothing tells the model when to use them. |
| G8 | Logic lives in a PowerShell string inside an NSIS template, duplicated 4× (install/uninstall × Desktop/Code) | Untestable, unlintable; quoting bugs only surface on customer machines. |

---

## 3. The design for Conxa

### 3.1 Architecture: registration moves into the runtime

Add two subcommands to the runtime host exe:

```
conxa-runtime.exe register-mcp   [--plan] [--dry-run] [--only <id>[,<id>]] [--force]
conxa-runtime.exe unregister-mcp [--plan] [--dry-run] [--only <id>[,<id>]]
```

NSIS then reduces to:

```nsis
nsExec::ExecToLog '"${RUNTIME_ROOT}\current\conxa-runtime.exe" register-mcp'
Pop $0
IntCmp $0 0 mcp_ok mcp_err mcp_err
```

This single change fixes G1, G2, G3, G5 and G8 at once — because they all become ordinary JavaScript in `runtime/` with ordinary tests in `runtime/test/`, instead of escaped PowerShell inside `FileWrite` lines. It also gives us re-registration after a repair or update for free, and a support command we can ask a customer to run.

Placement note: this must live in the **host exe** (`bootstrap.js` side) or be reachable without the app layer, so registration still works when the app layer is mid-update. Simplest: a `mcp_register.js` module in the app layer, invoked through bootstrap, with the NSIS call happening after the app layer is staged.

### 3.2 The client registry — one data table

Mirror `agent_clients.c`: a flat array, no per-client code paths.

```js
// runtime/mcp_hosts.js
// { id, name, stability, detect, configPath, objectPath, shape, supportsEnv }
// stability: 'stable'   — write whenever detect() is true
//            'conditional' — write only when an existing config file proves the host is active
module.exports = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    stability: 'stable',
    detect: () => existsAny([storeClaudeDir(), path.join(APPDATA, 'Claude')]),
    configPath: () => path.join(storeClaudeDir() ?? path.join(APPDATA, 'Claude'),
                                'claude_desktop_config.json'),
    objectPath: ['mcpServers'],
    shape: 'standard',
    supportsEnv: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    stability: 'stable',
    detect: () => dirExists(path.join(HOME, '.cursor')),
    configPath: () => path.join(HOME, '.cursor', 'mcp.json'),
    objectPath: ['mcpServers'],
    shape: 'standard',
    supportsEnv: true,
  },
  // …one row per host
];
```

### 3.3 Client matrix

Paths below are what `codebase-memory-mcp` actually resolves, cross-checked against the code. **Verify each against the vendor's current docs before shipping** — these drift, and a wrong path is a silently unconfigured customer.

Windows paths assume `HOME = %USERPROFILE%`, `APPDATA = %APPDATA%`, `LOCALAPPDATA = %LOCALAPPDATA%`.

| Host | Detect probe | Config file (Windows) | macOS | Object path | Shape |
|---|---|---|---|---|---|
| **Claude Desktop** | `%APPDATA%\Claude` or `%LOCALAPPDATA%\Packages\Claude_*` | Store: `…\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json`; else `%APPDATA%\Claude\claude_desktop_config.json` | `~/Library/Application Support/Claude/…` | `mcpServers` | standard |
| **Claude Code** | `$CLAUDE_CONFIG_DIR` else `~/.claude` dir exists | `%USERPROFILE%\.claude.json` (parent honours `$CLAUDE_CONFIG_DIR`) | same | `mcpServers` | standard |
| **Cursor** | `~/.cursor` dir | `%USERPROFILE%\.cursor\mcp.json` | same | `mcpServers` | standard |
| **VS Code (Copilot)** | `Code/User` dir | `%APPDATA%\Code\User\mcp.json` **plus one per profile** under `Code/User/profiles/<id>/mcp.json` | `~/Library/Application Support/Code/User/mcp.json` | `servers` | `type:"stdio"` |
| **Windsurf** | `~/.codeium/windsurf` dir | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` | same | `mcpServers` | standard |
| **Codex CLI** | `$CODEX_HOME` else `~/.codex` dir | `%USERPROFILE%\.codex\config.toml` | same | `[mcp_servers.<name>]` | TOML, managed block |
| **Gemini CLI** | `~/.gemini/settings.json` or `gemini` on PATH | `%USERPROFILE%\.gemini\settings.json` | same | `mcpServers` | standard |
| **Antigravity** | `~/.gemini/antigravity-cli` | `%USERPROFILE%\.gemini\config\mcp_config.json` | same | `mcpServers` | standard |
| **Qwen Code** | `$QWEN_HOME` else `~/.qwen` | `%USERPROFILE%\.qwen\settings.json` | same | `mcpServers` | standard |
| **Cline** | `~/.cline` or `$CLINE_DATA_DIR` | `%USERPROFILE%\.cline\mcp.json` **and** `${CLINE_DATA_DIR:-~/.cline/data}\settings\cline_mcp_settings.json` | same | `mcpServers` | standard (no `type`) |
| **Zed** | platform Zed config dir | `%APPDATA%\Zed\settings.json` (JSONC) | `~/Library/Application Support/Zed/settings.json` | `context_servers` | standard |
| **GitHub Copilot CLI** | `$COPILOT_HOME/mcp-config.json` or `copilot` on PATH | `%USERPROFILE%\.copilot\mcp-config.json` | same | `mcpServers` | `type:"local"` |
| **Factory Droid** | `~/.factory` or `droid` on PATH | `%USERPROFILE%\.factory\mcp.json` | same | `mcpServers` | `type:"stdio"` |
| **KiloCode** | `~/.config/kilo` or `kilo` on PATH | `%USERPROFILE%\.config\kilo\kilo.jsonc` | same | `mcp` | `type:"local"`, **command is an array** |
| **OpenCode** | `$OPENCODE_CONFIG` / `~/.config/opencode` | resolved global config | same | `mcp` | `type:"local"`, command array |
| **OpenHands** | `~/.openhands` | `%USERPROFILE%\.openhands\mcp.json` | same | `mcpServers` | standard |
| **Junie (JetBrains)** | `~/.junie` | `%USERPROFILE%\.junie\mcp\mcp.json` | same | `mcpServers` | standard |
| **Kiro** | `$KIRO_HOME` | `$KIRO_HOME\settings\mcp.json` | same | `mcpServers` | standard |
| **Crush** | `~/.config/crush` or `crush` on PATH | `%USERPROFILE%\.config\crush\crush.json` | same | `mcp` | `type:"stdio"` |
| **Goose** | `~/.config/goose` | `%USERPROFILE%\.config\goose\config.yaml` | same | `extensions` (YAML) | `type/cmd/args/enabled` |
| **Hermes** | `$HERMES_HOME` | `$HERMES_HOME\config.yaml` | same | `mcp_servers` (YAML) | `command:` |
| **Continue** | `~/.continue/config.yaml` | `%USERPROFILE%\.continue\config.yaml` | same | `mcpServers` (YAML) | `command:` |
| **Tabnine** | `tabnine` on PATH | `%USERPROFILE%\.tabnine\mcp_servers.json` | same | `mcpServers` | standard |
| **Sourcegraph Cody** | opt-in only | editor settings | — | `cody.mcpServers` | standard |
| **OpenClaw** | `$OPENCLAW_CONFIG_PATH` / state dir | `openclaw.json` | same | `mcp` → `servers` | standard |
| **Mistral Vibe** | `$VIBE_HOME` | `$VIBE_HOME\config.toml` | same | `[[mcp_servers]]` w/ `name` | TOML array table |

### 3.4 The four entry shapes

```jsonc
// "standard" — Claude Desktop/Code, Cursor, Windsurf, Gemini, Zed, Cline, …
"conxa": {
  "command": "C:\\Users\\me\\.conxa\\conxa-runtime\\current\\conxa-runtime.exe",
  "args": [],
  "env": { "CONXA_DIR": "…", "CONXA_ENV": "…", "CONXA_UPDATE_CHANNEL": "…" }
}

// "stdio" — VS Code (under "servers"), Factory, Crush
"conxa": { "command": "…", "args": [], "type": "stdio" }

// "local" — Copilot CLI
"conxa": { "command": "…", "args": [], "type": "local" }

// "local-array" — KiloCode, OpenCode: command is an ARRAY, no separate args
"conxa": { "command": ["…\\conxa-runtime.exe"], "type": "local" }
```

Conxa's entry always carries `env` (`CONXA_DIR`, `CONXA_ENV`, `CONXA_UPDATE_CHANNEL`) — that's our difference from cbm, which needs no env. Hosts that don't support `env` in their schema need those values baked another way (a `pack.json` lookup relative to the exe, which the runtime already does).

Keep pointing `command` at `…\conxa-runtime\current\conxa-runtime.exe`. The junction indirection is why config is written once and never rewritten by an update — that design is already correct and every new host inherits it.

### 3.5 The writer — six rules

For each detected host, in order:

1. **Resolve** the config path from the row (env overrides first).
2. **Refuse non-regular files.** `fs.lstatSync` — if it's a symlink or reparse point, skip and report. Never follow.
3. **Read the exact bytes** and keep them as the CAS snapshot. Missing file is fine (create it, and its parent).
4. **Ownership check.** If an entry exists under our key and its `command` doesn't resolve into our install root (`~/.conxa` / `~/.conxa-dev`), **skip and report** — do not overwrite. Same key + our path ⇒ ours ⇒ safe to update.
5. **Edit + atomic publish.** Parse, set the one key, serialize, write `<config>.conxa.tmp.<pid>`, `fsync`, then `rename()` over the target. Re-read and compare against the snapshot immediately before the rename; if it changed, abort and retry once.
6. **Report** per host: `ok` / `skipped:not-detected` / `skipped:foreign-entry` / `error:<reason>`. Never abort the whole run because one host failed. Exit non-zero only if *every* detected host failed.

### 3.6 Reference implementation (the core, ~70 lines)

```js
// runtime/mcp_register.js
const fs = require('fs'), path = require('path'), os = require('os');

const KEY = process.env.CONXA_ENV === 'dev' ? 'conxa-dev' : 'conxa';
const ROOT = path.join(os.homedir(), KEY === 'conxa-dev' ? '.conxa-dev' : '.conxa');

function entryFor(shape) {
  const command = path.join(ROOT, 'conxa-runtime', 'current', 'conxa-runtime.exe');
  const env = { CONXA_DIR: ROOT, CONXA_ENV: process.env.CONXA_ENV || 'stable',
                CONXA_UPDATE_CHANNEL: process.env.CONXA_UPDATE_CHANNEL || 'stable' };
  if (shape === 'local-array') return { command: [command], type: 'local', env };
  const e = { command, args: [], env };
  if (shape === 'stdio') e.type = 'stdio';
  if (shape === 'local') e.type = 'local';
  return e;
}

// Ours iff the command points inside our install root. Anything else is foreign.
function isOurs(existing) {
  if (!existing) return true;                      // absent == free to write
  const cmd = Array.isArray(existing.command) ? existing.command[0] : existing.command;
  return typeof cmd === 'string' &&
         path.resolve(cmd).toLowerCase().startsWith(path.resolve(ROOT).toLowerCase());
}

function atomicWrite(file, text) {
  const tmp = `${file}.conxa.tmp.${process.pid}`;
  const fd = fs.openSync(tmp, 'wx');               // wx: never clobber a stale temp
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);                        // atomic on NTFS and POSIX
}

function register(host, { dryRun = false } = {}) {
  const file = host.configPath();
  const st = fs.existsSync(file) ? fs.lstatSync(file) : null;
  if (st && !st.isFile()) return { host: host.id, status: 'error:not-a-regular-file' };

  const before = st ? fs.readFileSync(file, 'utf8') : null;
  let doc; try { doc = before ? JSON.parse(before) : {}; }
  catch { return { host: host.id, status: 'error:unparseable' }; }

  let node = doc;
  for (const seg of host.objectPath) node = (node[seg] ??= {});
  if (!isOurs(node[KEY])) return { host: host.id, status: 'skipped:foreign-entry' };

  node[KEY] = entryFor(host.shape);
  if (dryRun) return { host: host.id, status: 'would-write', file };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  // CAS: the file must still be exactly what we parsed.
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (now !== before) return { host: host.id, status: 'error:changed-underneath' };
  atomicWrite(file, JSON.stringify(doc, null, 2) + '\n');
  return { host: host.id, status: 'ok', file };
}

module.exports = { register, isOurs, entryFor, KEY, ROOT };
```

Unregister is the same shape with `delete node[KEY]` guarded by the identical `isOurs()` check, and **must use `KEY`, not a hardcoded `'conxa'`** — that is bug G4.

Deliberate simplifications, with their ceilings:
- `JSON.parse`/`stringify` still reserializes (G1 partially open). Acceptable for `mcp.json`-style files, which are shallow and machine-written in practice. **Not** acceptable for Zed's `settings.json` or KiloCode's `.jsonc`, which are hand-edited and comment-bearing — those need a JSONC-preserving edit (`jsonc-parser`'s `modify`/`applyEdits` does exactly this in ~5 lines, and is the one dependency worth adding). Mark it `// ponytail: full-doc reserialize; use jsonc-parser modify() for comment-bearing configs`.
- No TOML/YAML writer in v1 — that's why Codex, Goose, Hermes, Continue and Vibe are phase 3.
- `renameSync` on Windows fails if the destination is open with exclusive share. We already kill the Desktop app before registering; extend that kill to whichever hosts we newly target, or retry the rename a few times with a short backoff.

### 3.7 Uninstall symmetry

Every row gets removal through the same table and the same `isOurs()` gate. A user who hand-edited our entry keeps their edit. Removal must also happen at the *right* time: Conxa's NSIS already removes the runtime only when no other company's skill packs remain — keep that condition and just route the MCP removal through the new subcommand.

### 3.8 Discoverability (G7)

Registering the server does not make the model use it. After registration, for hosts that have a documented convention, write a small file naming the company's workflows and when to call `execute_skill`:

| Host | Where |
|---|---|
| Claude Code | `~/.claude/skills/conxa-<company>/SKILL.md` |
| Cursor | `~/.cursor/rules/` |
| Windsurf | `~/.codeium/windsurf/memories/global_rules.md` |
| VS Code / Copilot | `~/.copilot/skills/` |
| Codex / Factory / OpenCode | `AGENTS.md` |
| Gemini / Qwen | `GEMINI.md` / `QWEN.md` |

Same ownership discipline applies: managed marker block (`<!-- >>> conxa >>> … <<< conxa <<< -->`), never a blind overwrite of a user's file. The runtime already knows the company's skill list at sync time, so the content can be generated rather than templated per install. This directly serves the durability-flywheel framing in `research-analysis/07-go-to-market/agentic-discovery-strategy.md`.

---

## 4. Rollout

| Phase | Scope | Why this order |
|---|---|---|
| **P0** | Fix G4 — uninstaller removes `${MCP_SERVER}`, not literal `'conxa'` | Live bug, 4-character fix, ships independently of everything else |
| **P1** | `register-mcp` / `unregister-mcp` subcommands; port the two existing hosts; atomic write + ownership check + CAS + symlink guard; NSIS calls the subcommand | Fixes G1–G3, G5, G8. No new hosts yet — prove the mechanism against the two we already support |
| **P2** | Registry table + JSON hosts: Cursor, VS Code (incl. per-profile `mcp.json`), Windsurf, Gemini, Cline, Zed (JSONC), Copilot CLI, Factory | The market expansion. Each is a table row once P1 lands |
| **P3** | `--plan` receipt; per-host status report surfaced in the installer's completion dialog | Auditability — cheap, and it's a `docs/Sales-Blockers.md` item |
| **P4** | Durable context files per host | Turns "registered" into "actually used" |
| **P5** | TOML/YAML hosts: Codex, Goose, Hermes, Continue, Vibe | Needs new writers; lowest ratio of reach to effort |

---

## 5. Test plan

Fixture-driven, in `runtime/test/`, no host required:

1. **Fresh config** — file absent ⇒ created with exactly one entry, parent dirs made.
2. **Existing foreign servers** — a config with three other MCP servers ⇒ all three survive byte-identically, ours added.
3. **Foreign entry under our key** — `conxa` pointing at `C:\Other\thing.exe` ⇒ `skipped:foreign-entry`, file unchanged.
4. **Our entry, stale path** — points at an old version dir ⇒ updated in place.
5. **Symlinked config** ⇒ refused, file untouched.
6. **Malformed JSON** ⇒ `error:unparseable`, file untouched, run continues to other hosts.
7. **Concurrent modification** — mutate the file between read and write ⇒ `error:changed-underneath`, no write.
8. **Round-trip** — register then unregister ⇒ file byte-identical to its original state.
9. **Dev channel** — `CONXA_ENV=dev` ⇒ writes and removes `conxa-dev`, leaves a `conxa` entry alone (the G4 regression test).
10. **Shape coverage** — one snapshot test per shape (standard / stdio / local / local-array).

Test 8 and test 9 are the ones that would have caught the current bug.

---

## 6. Explicitly not recommended

- **Hooks that gate tool calls.** cbm's hook is safe only because it is structurally incapable of blocking (`exit 0`, empty stdout, hard deadline). If Conxa ever ships one, it inherits that rule verbatim — otherwise a Conxa install can brick a customer's agent. Not worth it in v1.
- **The Scout/Verify/Auditor tiered agent scheme.** That solves graph-query discipline; Conxa's tools are deterministic workflow executions, not evidence gathering. No fit.
- **Enabling anything on the customer's behalf.** cbm is explicit that it never flips experimental feature flags, enables plugins, or grants permission bypasses. Same line for us: register the server, write our own files, touch nothing else.

---

## 7. One-line summary

The transferable idea is not "support 43 clients" — it is **treat the customer's agent config as a foreign document you are a guest in**: detect from filesystem evidence, keep the host list as data, edit one key surgically, refuse anything you don't own, publish atomically, and be able to print exactly what you would do before doing it. Conxa currently reserializes and force-overwrites two files from an untested PowerShell string, and its uninstaller misses the dev-channel key.
