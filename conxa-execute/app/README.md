# CONXA (v0.1)

Windows app to **run** recorded skills without Claude Desktop. The executor is still `conxa-runtime.exe`. This window is another MCP caller.

```
cd conxa-execute/app
npm install
npm run dev
```

Needs an installed runtime at `%USERPROFILE%\.conxa\conxa-runtime\current\conxa-runtime.exe` (or `.conxa-dev`). Override with `CONXA_EXECUTE_RUNTIME`.

Signing in to CONXA is required to use the app. Once signed in:
- **Form** works with no API key — running a skill never calls a model.
- **Chat** (BYOK mode) needs a bring-your-own OpenAI-compatible URL + key in Settings; Top-up/Subscription/workspace-pool modes use CONXA's own managed chat instead.

See `NOTICE` for the pinned OpenCode commit. Vendor clone stays outside git (`Desktop/vendor-src/opencode`).
