# Conxa Execute (v0.1)

Windows app to **run** recorded skills without Claude Desktop. The executor is still `conxa-runtime.exe`. This window is another MCP caller.

```
cd conxa-execute
npm install
npm run dev
```

Needs an installed runtime at `%USERPROFILE%\.conxa\conxa-runtime\current\conxa-runtime.exe` (or `.conxa-dev`). Override with `CONXA_EXECUTE_RUNTIME`.

- **Form** works with no API key.
- **Chat** needs a bring-your-own OpenAI-compatible URL + key in Settings.

See `NOTICE` for the pinned OpenCode commit. Vendor clone stays outside git (`Desktop/vendor-src/opencode`).
