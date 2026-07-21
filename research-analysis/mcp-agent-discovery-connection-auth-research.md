# How MCP Servers Get Auto-Configured Into AI Agents — Findings from `research-analysis/repo`

## Scope note (read first)

`research-analysis/repo/` contains four repos: `caveman-main`, `impeccable-main`, `superpowers-main`, `taste-skill-main`. All four are **AI coding-agent skill/plugin distribution frameworks** (Claude Code, Codex, Cursor, Gemini CLI, Copilot, Kiro, OpenCode, Pi, Qoder, Trae, Rovo Dev, opencode, OpenClaw, etc.) — not MCP servers themselves. Direct MCP auto-configuration logic is limited to one installer path (`caveman-shrink`), plus one deliberate decision to avoid MCP entirely (`impeccable`). This document reports only what is actually present.

An MCP index consulted mid-session referenced a `browser-use-main` and `devtools-frontend-main` repo under this path; neither exists on disk (verified via `find`). Those results are stale and are not used below.

---

## 1. The core mechanism: shell out to the host's own registration verb, never hand-write its config

`caveman-main/bin/install.js:1031` — `installMcpShrink(ctx)` — is the only place in the whole corpus that programmatically wires an MCP server into an agent. The mechanism is deliberately not "write JSON into the client's config file." It is:

1. **Probe the package exists**: `npm view caveman-shrink name`. Clean skip (not a crash) if the registry is unreachable.
2. **Probe the host CLI has a registration verb**: `captureSpawn('claude', ['mcp', '--help'])`. Only Claude Code is wired this way in this codebase, because Claude Code ships a native `claude mcp add` subcommand.
3. **If present, shell out to it**: `spawn('claude', ['mcp', 'add', 'caveman-shrink', '--', 'npx', '-y', 'caveman-shrink', ...upstreamArgs])`. Claude Code's own CLI performs the actual write to `~/.claude.json`'s `mcpServers` block — the installer never opens or parses that file.
4. **If absent, do not fall back to hand-editing config**: print the raw JSON snippet and a docs link, and tell the user to add it themselves. Contrast this with `settings.json` elsewhere in the same installer, which *is* written directly — but only because `bin/lib/settings.js` has a purpose-built JSONC-tolerant read/merge/`validateHookFields`-before-write path. No equivalent safe-merge helper exists for `mcpServers`, so the installer refuses to touch it blind.
5. **Never auto-enabled**: gated behind an explicit `--with-mcp-shrink=<upstream-command>` flag that must name what to wrap. `tests/installer/unit.argv.test.mjs` asserts `--all` does **not** turn this on — there's no sensible default upstream MCP server to proxy, so the installer refuses to guess.

```js
// bin/install.js:1031 (condensed)
function installMcpShrink(ctx) {
  const probe = captureSpawn('npm', ['view', MCP_SHRINK_PKG, 'name']);
  if (probe.status !== 0) return { kind: 'skip', why: 'npm registry probe failed' };

  const help = captureSpawn('claude', ['mcp', '--help']);
  if (help.status !== 0) return { kind: 'skip', why: 'manual config required' }; // print snippet instead

  const upstream = opts.withMcpShrink; // array of upstream-cmd tokens, required by the flag parser
  const r = runSpawn('claude', ['mcp', 'add', 'caveman-shrink', '--', 'npx', '-y', MCP_SHRINK_PKG, ...upstream]);
  return spawnOk(r) ? { kind: 'ok' } : { kind: 'fail', why: 'claude mcp add failed' };
}
```

**The generalizable pattern:** prefer the host agent's own "register an MCP server" CLI verb over parsing/writing its config file directly. The config file's location and shape (`~/.claude.json` vs whatever Cursor/Gemini/etc. use) is an implementation detail of the host; the CLI verb (`claude mcp add`) is the stable, supported surface, and it's the host's own code doing the JSON merge, not a third party guessing at the schema. When no such verb exists, the corpus's answer is "skip and print instructions," not "best-effort JSON surgery."

## 2. The same philosophy one level up: per-agent install/extension CLI instead of writing any config format

`install.js`'s `PROVIDERS` array is the single source of truth for how caveman gets wired into every supported agent. Every entry resolves to one of a small number of mechanisms, none of which is "this installer writes agent X's native config file":

| Mechanism | Example agent(s) | What actually runs |
|---|---|---|
| MCP registration verb | Claude Code (`--with-mcp-shrink` only) | `claude mcp add <name> -- <upstream-cmd>` |
| Extension-install CLI verb | Gemini CLI | `gemini extensions install https://github.com/<repo>` |
| Third-party skill installer | Cursor, Windsurf, Cline, Copilot, and 20+ others | `npx skills add <repo> -a <profile>` — delegates to the upstream [`vercel-labs/skills`](https://github.com/vercel-labs/skills) package, which already knows each agent's on-disk skill format |
| Plugin manifest (declarative, no install-time write) | Claude Code, Codex | `.claude-plugin/marketplace.json` / `.codex-plugin/plugin.json` — the agent's own plugin loader reads these; caveman ships the file, never mutates the agent's state |

Each `PROVIDERS` entry carries: `id`, `label`, `mech` (which of the above), a `detect` clause (e.g. `command:foo||dir:$HOME/x`, checked against what's actually installed — not a network probe), and optionally a `profile` slug for the `npx skills add` path. Detection decides *whether* to attempt install; it never decides *how* — that's fixed per `mech`.

## 3. The one repo that deliberately has nothing to auto-configure

`impeccable-main/docs/openai-plugin-submission.md` documents Impeccable's OpenAI plugin submission choosing **"Skills only"** explicitly *because* it has no MCP server to register:

> "No MCP server ... or private network is required."

This matters for the auto-configuration question specifically: a plugin with no MCP server has no `mcpServers` block to write, no host CLI verb to shell out to, and no manual-fallback snippet to print — the entire configuration surface this document is about simply doesn't exist for it. It reaches every harness purely through the skill-file/plugin-manifest mechanisms in §2, which is why a mature multi-harness project chose that path when it could.

## 4. `mcp` as a declarable skill-frontmatter field — present in the spec, unused in practice

`impeccable-main/docs/HARNESSES.md` lists `mcp` among the **provider-specific frontmatter extensions** a skill can declare (line 32), and notes:

> "Codex CLI uses a separate `agents/openai.yaml` sidecar for skill metadata (icons, branding, MCP tools, invocation control)."

So Codex's skill packaging format has a place for a skill to declare "these MCP tools should come with me" as part of install — a fourth potential auto-configuration path, orthogonal to the CLI-verb approach in §1. In practice, the checked-in `openai.yaml` sidecars (`caveman/agents/openai.yaml`, `impeccable/agents/openai.yaml`) only carry branding fields (`display_name`, `icon`, `default_prompt`) — neither repo actually exercises the MCP-tool-wiring capability. Worth knowing the hook exists in Codex's format even though no example of it firing is in this corpus.

## 5. Adjacent mechanism: skill auto-*activation* (not MCP, but the same "no user action required" goal)

Not MCP configuration, but the corpus's closest analog to "the agent automatically starts using a capability without being told" is caveman's hook pair:

- `SessionStart` hook (`src/hooks/caveman-activate.js`) injects the full skill ruleset as hidden system context on every session start — unconditional, no user action.
- `UserPromptSubmit` hook (`caveman-mode-tracker.js`) matches slash-commands and natural-language phrases, flips a shared flag file, and re-injects a short reminder every turn so competing plugin instructions don't override it mid-conversation.

Useful as a contrast: skill activation is bootstrapped automatically by the *harness's own hook system* at session start; MCP server registration in this corpus is never automatic in that sense — it's a one-time, explicit, opt-in installer step (§1), not something re-asserted every session.

## 6. Takeaways if any of this maps onto CONXA

- The one directly transferable idea: **if CONXA ever needs to register an MCP server into a customer's existing agent config, prefer shelling out to that agent's own registration CLI (where one exists) over writing `mcpServers` JSON by hand** — same reasoning as §1: the host owns its schema and does the merge safely; a third party doing raw JSON surgery on a file it doesn't control risks corrupting other entries.
- Second idea, from `caveman-shrink` itself (the proxy, not the installer): a thin stdio JSON-RPC line-proxy that intercepts `tools/list`/`prompts/list` responses is a well-tested, minimal way to modify an upstream MCP server's tool catalog without forking it — relevant if CONXA ever needs to layer company-specific metadata onto a third-party MCP server's tools.
- Nothing here suggests changing CONXA's actual runtime distribution model (pack.json + sync.js delta-sync) — none of these four repos solve a comparably hard multi-tenant distribution problem; they solve "get one static config block into one agent's local file."
