# What Ships to the Customer's Machine — Skill Pack Contents Explained

This doc explains, in plain language, exactly what lands on an end customer's computer inside:

```
~/.conxa/skill-packs/<company>/<group>/<skill-slug>/
```

and what each file does, with examples.

---

## The one big thing to understand first

**The skill pack contains NO program code. It is 100% data (JSON + metadata).**

There is no `execution.js` or `recovery.js` in the skill pack. Those are *runtime programs* and they live separately on the customer's machine at:

```
~/.conxa/conxa-app/vX.Y.Z/     <- the "app layer" that actually runs skills
                                  (contains run.js, recovery.js, resolver.js, server.js ...)
```

Think of it like this:

- **Skill pack** = a recipe card (data: steps, selectors, fallbacks, inputs).
- **conxa-app layer** = the chef (code: reads the recipe and drives the browser).

The chef is installed once and updated independently. The recipe cards are downloaded per company via delta sync (`sync.js`). This split is deliberate: recipes can change daily without touching the engine.

---

## Folder layout on the customer machine

```
~/.conxa/
├── conxa-runtime/
│   ├── v1.x.x/                  <- host exe (bootstrap only)
│   └── current                  -> junction to active version
├── conxa-app/
│   ├── vX.Y.Z/                  <- server.js, run.js, recovery.js, resolver.js ...
│   └── current                  -> junction to active version
├── skill-packs/
│   └── <company>/               e.g. acme
│       ├── pack.json            ★ the ONLY file the installer writes
│       └── <group_id>/          e.g. crm-tasks  (falls back to "_default")
│           └── <skill_slug>/    e.g. create-invoice
│               ├── v1.2.0/      ← fully self-contained version folder
│               │   ├── execution.json
│               │   ├── recovery.json
│               │   ├── inputs.json
│               │   ├── manifest.json
│               │   ├── validation.json   (only if present on the cloud)
│               │   └── version.json      (written by sync.js, not shipped)
│               └── current      -> junction to v1.2.0
└── chromium/                    <- Playwright browser
```

Every update creates a new `vX.Y.Z/` folder; the `current` junction is flipped only after all files pass SHA-256 checks. If activation fails, `current` stays untouched — automatic rollback. Old versions are pruned (last 3 kept).

---

## File-by-file walkthrough

### 1. `pack.json` — the company-level "table of contents"

One per company, sitting flat at `skill-packs/<company>/pack.json`. The installer ships this single file; everything else arrives via sync.

```json
{
  "workspace_id": "acme",
  "display_name": "Acme Inc",
  "skill_pack_version": "1.2.0",
  "required_runtime": ">=1.0.3",
  "target_url": "https://app.acme.com",
  "skills": ["create-invoice", "update-crm-record"],
  "skill_groups": { "create-invoice": "crm-tasks", "update-crm-record": "crm-tasks" },
  "groups": [
    {
      "id": "crm-tasks",
      "name": "CRM Tasks",
      "apps": [
        { "id": "acme-app", "name": "Acme App",
          "login_url": "https://app.acme.com/login",
          "success_url": "https://app.acme.com/dashboard" }
      ]
    }
  ],
  "sync_endpoint": "https://apis.conxa.in/skill-packs/acme/delta",
  "sync_token": "<minted at publish>",
  "tracking": {
    "enabled": true,
    "tracking_url": "https://apis.conxa.in/api/tracking/acme/events",
    "tracking_token": "<HMAC-SHA256 token>",
    "workspace_id": "acme",
    "schema_version": 1,
    "protocol_version": 1
  },
  "built_at": "2026-08-22T10:00:00Z"
}
```

Easy-language summary: *"Here are the skills this customer gets, how they're grouped, where to download updates from, where to send usage telemetry, and which runtime version you need."*

Notes:
- `groups[].apps` defines shared app logins for a group (the runtime logs into each app once, then runs all skills in the group).
- `tracking_token` lets the runtime phone home telemetry without exposing real credentials (HMAC, not raw secret).
- `sync_endpoint` is frozen at build time (dev vs prod).

### 2. `manifest.json` — one skill's ID card and safety net

```json
{
  "slug": "create-invoice",
  "name": "Create Invoice",
  "description": "Creates an invoice in Acme App",
  "version": "1.2.0",
  "required_runtime": ">=1.0.3",
  "company": "acme",
  "target_url": "https://app.acme.com/invoices/new",
  "group_id": "crm-tasks",
  "required_apps": ["acme-app"],
  "inputs_required": ["customer_name", "amount"],
  "structural_fingerprint": {
    "landmarks": [
      {
        "intent": "click the Save button",
        "primary_selector": "[data-testid=save-btn]",
        "data_testid": "save-btn",
        "inner_text": "Save",
        "tag": "button"
      }
    ],
    "landmark_count": 1
  },
  "checksum": {
    "execution.json": "<sha256>",
    "recovery.json": "<sha256>",
    "inputs.json": "<sha256>"
  }
}
```

Easy-language summary:
- `inputs_required` — the runtime refuses to run if these inputs aren't provided.
- `checksum` — before running anything, the runtime re-computes SHA-256 of each data file and throws if even one byte was tampered with.
- `structural_fingerprint.landmarks` — "drift check" landmarks. Before executing, the runtime looks at the live page and compares it against these landmarks ("there should be a button tagged save-btn saying 'Save'"). If the website changed so much that landmarks no longer match, the run is stopped early instead of clicking random things.
- `required_apps` — which group app logins must succeed before this skill runs.

### 3. `execution.json` — the actual workflow (the heart)

A plain JSON array of steps. Example:

```json
[
  { "type": "navigate", "url": "{{fixture_url}}" },

  { "type": "if_present", "selector": "#cookie-banner", "timeout_ms": 1500,
    "steps": [ { "type": "click", "selector": "#accept-cookies" } ] },

  { "type": "fill", "selector": "[data-testid=invoice-title]", "value": "{{title}}" },

  { "type": "click", "selector": "[data-testid=save-btn]",
    "identity_bundle": {
      "signals": [
        { "engine": "css", "selector": "[data-testid=save-btn]",
          "durability": 0.97, "orthogonality_class": "test-id",
          "unique_at_compile": true, "source": "manual" },
        { "engine": "role", "selector": "internal:role=button[name=\"Save\"]",
          "durability": 0.95, "orthogonality_class": "semantic-aria" },
        { "engine": "text_based", "selector": "internal:text=\"Save\"",
          "durability": 0.85, "orthogonality_class": "visible-text" }
      ],
      "fingerprint": { "role": "button", "tag": "button", "inner_text": "Save",
                       "data_testid": "save-btn" },
      "stable_hash": "<class-stripped sha256>",
      "frame_chain": []
    }
  },

  { "type": "check", "kind": "url", "url": ".../invoices/new/confirm" }
]
```

Easy-language summary: it's a numbered list of browser actions — *go here, type this, click that, verify the result*.

Key things inside it:

| Piece | What it means |
|---|---|
| Step types | `navigate`, `click`, `fill`, `type`, `select`, `hover`, `scroll`, `wait`, `screenshot`, `keyboard_shortcut`, `drag_drop`, `upload`, `check/assert`, and branching (`if_present`, `try_dismiss`, `wait_for_one_of`) |
| `{{placeholders}}` | Values filled at runtime from user inputs (e.g. `{{customer_name}}`) |
| `identity_bundle.signals` | Multiple independent ways to find the same element, ranked by durability. If the top signal breaks, the runtime tries the next. This is why skills survive website redesigns |
| `frame_chain` | If the element lived inside an iframe(s), the exact chain is preserved so execution enters the right frames |
| `check` steps | Assertions — verify the outcome (URL changed, text appeared, etc.) |

Important: there is **no JavaScript logic here** — the runtime's `run.js` interprets these steps. Also note the resolver never blindly picks the first candidate; it requires a clear winning match (margin gate), otherwise it falls through to the next signal.

### 4. `recovery.json` — the "plan B" book for when things break

```json
{
  "steps": [
    {
      "step_id": 3,
      "intent": "click_save_button",
      "target": { "text": "Save", "role": "button" },
      "anchors": [
        { "text": "Save", "priority": 2 },
        { "text": "Invoice Details", "priority": 1 }
      ],
      "fallback": { "text_variants": ["Save", "Update"], "role": "button" },
      "selector_context": {
        "primary": "[data-testid=save-btn]",
        "alternatives": ["button:has-text(\"Save\")"]
      },
      "visual_ref": "visuals/Image_3.jpg"
    }
  ]
}
```

Easy-language summary: for tricky steps, extra hints recorded at compile time — *what this step was trying to do, what text/role to look for, neighboring elements to anchor on, alternative button labels*. When the primary selector fails, the runtime's recovery ladder (in `recovery.js` — part of the app layer, NOT the pack) uses these hints. Tiers 1–2 cost zero LLM tokens; LLM help only fires at Tier 3+.

Limits baked in at compile time: max 4 anchors, max 4 fallback text variants, max 5 selector alternatives, no XPath allowed.

### 5. `inputs.json` — what the user must provide

```json
{
  "inputs": [
    { "name": "customer_name", "type": "string",
      "description": "Name of the customer to bill" },
    { "name": "amount", "type": "number",
      "description": "Invoice amount" },
    { "name": "api_key", "type": "string", "sensitive": true,
      "description": "Not shown in logs" },
    { "name": "currency", "type": "string", "optional": true,
      "enum": ["USD", "EUR", "INR"], "default": "USD" }
  ]
}
```

Before executing, the runtime checks required inputs (cross-checked against `manifest.inputs_required`), applies defaults, and never logs values marked `sensitive`.

### 6. `validation.json` — optional extra outcome checks

Served by the cloud delta endpoint if present, but nothing currently generates it. Reserved slot for richer post-run validation.

### 7. `version.json` — written ON the customer machine, not shipped

```json
{ "skill_version": "1.2.0", "released_at": "2026-08-20T09:00:00Z" }
```

Written by `sync.js` after a successful verified download. Used to compute deltas ("what version do I have? → only send me newer ones").

---

## Files that do NOT ship to customers

These exist only in the Studio-side legacy bundle (`output/skill_package/<bundle>/skills/<slug>/`) and never reach the cloud/customer delta payload:

- `SKILL.md` / `index.md` / `Claude.md` — human & agent documentation
- `input.json` (Studio spelling) — renamed to `inputs.json` for the runtime format
- `structural_fingerprint.json` as a standalone file — embedded inside `manifest.json` instead
- `visuals/Image_<n>.jpg` screenshots
- Anything under `auth/` — **login credentials and cookies are hard-blocked from build output by invariant**

Old-style code files (`server.js`, `run.js`, `executor.js`, `recovery.js`, etc.) found in stale bundle folders are actively deleted by rebuilds — they belong to the app layer only.

---

## How it all flows, end to end

```
Studio (record + compile)                Cloud                     Customer machine
─────────────────────────          ─────────────────────       ─────────────────────
build produces                                        installer writes:
data/skill-packs/acme/...      →    uploaded per-file   →     ~/.conxa/skill-packs/acme/pack.json
                                    (base64, hashed)
                                                    first run: sync.js calls
                                                    GET .../skill-packs/acme/delta?since=...
                                                    ← downloads changed skills,
                                                      verifies SHA-256,
                                                      atomic write + flip `current`
execute_skill tool call:
  read manifest → check inputs → drift check vs fingerprint
  → run execution.json via run.js (+ identity_bundle resolution)
  → failures use recovery.json hints (zero-token tiers first)
  → telemetry → tracking_url from pack.json
```

---

## Quick reference table

| File | Shipped? | Level | One-line purpose |
|---|---|---|---|
| `pack.json` | Installer | Company | Table of contents, groups, sync + tracking config |
| `manifest.json` | Yes (delta) | Skill | ID card: version, required inputs/apps, checksums, drift landmarks |
| `execution.json` | Yes (delta) | Skill | The workflow itself — ordered step array with identity signals |
| `recovery.json` | Yes (delta) | Skill | Plan-B hints per step (anchors, text variants, alternatives) |
| `inputs.json` | Yes (delta) | Skill | Declared user inputs (types, sensitive flags, defaults) |
| `validation.json` | If present | Skill | Optional post-run validation rules |
| `version.json` | No — runtime-written | Skill/version | Local record of installed version for delta sync |
| `SKILL.md`, `visuals/`, docs | No — Studio bundle only | Skill | Human documentation & screenshots |
