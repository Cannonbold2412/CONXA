# Multi-Provider LLM Router Setup

## Summary

Implemented a multi-provider LLM router with automatic failover, per-key cool-down, and support for up to 5 different free-tier LLM providers. This enables high-volume LLM use during compilation without hitting rate limits.

## What's New

### 1. Multi-Provider LLM Router (`app/llm/router.py`)
- Manages a pool of (provider, endpoint, key, model) tuples from enabled providers
- Routes text/vision calls via LRU + per-key cool-down on 429 errors
- Handles 401/403 (permanent drop), 429 (60s cool-down), other errors (retry)
- Tracks per-entry metrics: `requests_sent`, `requests_429`, `cooled_until`, `last_used_at`
- Skips text-only providers for vision tasks

### 2. Extended Configuration (`packages/conxa-core/conxa_core/config.py`)
- Added 7 provider blocks pre-configured with latest free-tier models (May 2026):
  - **Groq** (enabled by default): 300+ tok/s, 30 req/min, text + vision
  - **Google AI Studio** (enabled): Best free-tier vision, 1500 req/day
  - **NVIDIA NIM** (enabled): 100+ free models, 40 req/min per model
  - **Cerebras** (disabled): Very fast text (2600+ tok/s), text-only
  - **Together AI** (disabled): 80+ free models, rate-limited
  - **OpenRouter** (disabled): Aggregator with free models, 50 req/day
  - **Mistral** (disabled): Text + Pixtral vision
- Each provider supports comma-separated API keys: `PROVIDER_API_KEYS=key1,key2,key3,key4,key5`
- Router behavior knobs: `LLM_ROUTER_COOLDOWN_SECS`, `MAX_RETRIES`, `REQUEST_TIMEOUT_MS`, `PREFER_FAST_FOR_TEXT`
- Backward compatible: if no provider enabled, falls back to legacy single-endpoint config

### 3. Router Integration
- The cloud exposes the pool behind `POST /api/v1/llm/proxy/{text,vision}`
  (`app/api/llm_proxy_routes.py`). Build Studio's compile pipeline calls the proxy
  via the `conxa_core.llm` router protocol (`conxa_core/llm/client.py`).
- The proxy meters usage per org and enforces the monthly token quota before
  dispatching to the router pool.

> **Note:** LLM-native selector generation was removed. Selectors are produced
> deterministically by `IdentityBundle` + `selector_grammar.py` in the Build
> Studio compiler; the LLM never writes selector strings. See the invariants in
> the root `CLAUDE.md`.

## Usage

### 1. Configure API Keys

Copy `.env.example` to `.env` and fill in API keys (user accounts):

```bash
# One key per Gmail account (example: 5 keys across 5 Gmail accounts on Groq)
GROQ_API_KEYS=key1,key2,key3,key4,key5

# Single key for Google AI Studio
GOOGLE_AI_STUDIO_API_KEYS=your-api-key

# Multiple keys for NVIDIA NIM
NVIDIA_NIM_API_KEYS=nvapi-abc123,nvapi-def456
```

### 2. Enable/Disable Providers

```env
# Enable Groq, Google AI Studio, NVIDIA NIM (default)
GROQ_ENABLED=true
GOOGLE_AI_STUDIO_ENABLED=true
NVIDIA_NIM_ENABLED=true

# Disable others initially
CEREBRAS_ENABLED=false
TOGETHER_ENABLED=false
OPENROUTER_ENABLED=false
MISTRAL_ENABLED=false
FREELLMAPI_ENABLED=false
```

### FreeLLMAPI (optional free-tier aggregator)

[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) is a self-hosted,
OpenAI-compatible proxy that stacks the free tiers of ~28 providers behind one
`/v1` endpoint. The router treats it as a single pool entry — one unified
`freellmapi-…` key unlocks all upstream free tiers configured inside it.

```env
FREELLMAPI_ENABLED=true
FREELLMAPI_ENDPOINT=http://127.0.0.1:3001/v1   # wherever you run the proxy
FREELLMAPI_API_KEYS=freellmapi-your-unified-key
FREELLMAPI_TEXT_MODEL=auto                     # proxy picks a model with quota
FREELLMAPI_VISION_MODEL=                       # pin a vision-capable model, e.g. google/gemini-2.5-flash
```

Caution: upstream free tiers carry experimentation-only ToS — keep at least one
direct provider in the pool as fallback for real customer traffic.


### 3. Router Behavior (Optional Tuning)

```env
# Cool a key for 60s after hitting rate limit
LLM_ROUTER_COOLDOWN_SECS=60

# Retry up to 3 times before giving up
LLM_ROUTER_MAX_RETRIES=3

# Per-request timeout (30s)
LLM_ROUTER_REQUEST_TIMEOUT_MS=30000

# Prefer Groq/Cerebras for text-only (faster)
LLM_ROUTER_PREFER_FAST_FOR_TEXT=true
```

## Backward Compatibility

- If **no providers enabled** in .env, the router pool is empty → it falls back to
  the legacy single-endpoint config (`SKILL_LLM_TEXT_ENDPOINT`, `SKILL_LLM_VISION_ENDPOINT`).
- `.env.example` includes both the multi-provider block and the legacy single-endpoint
  section.
