# Vendored OpenCode slice

Pinned commit: `a935432b5ce337523dfc5014629a09bc16784c42` (anomalyco/opencode, MIT).

This directory holds only the edited copies actually loaded at runtime (Node,
no Bun/Effect) — there is no upstream reference tree checked in here anymore.
For a diff against the pinned commit when upgrading, re-clone upstream
**outside** this repo (`../vendor-src/opencode` on the developer machine; do
not commit it) rather than keeping a copy in-tree.

**Edited copies we load at runtime:**
- `loop/run_turn.js` — `/chat/completions` body from `packages/llm/src/protocols/openai-chat.ts` + dispatch from `packages/llm/src/tool-runtime.ts`
- `mcp/stdio.js` — stdio MCP client from `packages/opencode/src/mcp/index.ts` (OAuth, TUI events, marketplace, and non-stdio transports stripped)
- `storage/storage.js` — session storage from `packages/opencode/src/storage/storage.ts` (see file header for the specific substitutions: plain `fs/promises` instead of opencode's private internals, a promise-chain mutex instead of `effect`'s semaphore/TxReentrantLock, no Git-based migrations)
- `session/compaction.js` — context-overflow pruning from `packages/opencode/src/session/compaction.ts`/`overflow.ts`, adapted to conxa-execute's flat OpenAI-chat message array instead of opencode's parts-based SessionV1 schema

**Not copied:** TUI, desktop, web, IDE, LSP, Copilot login, bash/file tools, `packages/app`, and every other LLM provider/protocol OpenCode ships (`packages/llm`) — conxa-execute talks to exactly one shape, OpenAI-compatible `/chat/completions`, hand-written in `loop/run_turn.js`.
