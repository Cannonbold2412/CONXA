<#
.SYNOPSIS
  conxa — the single dev/prod switch (Windows).

.DESCRIPTION
  Exports CONXA_ENV plus the isolated path roots for the chosen lane, then
  launches the target. Dev and Prod use completely separate trees
  ($HOME\.conxa-dev vs $HOME\.conxa, %APPDATA%\Conxa-Dev vs %APPDATA%\Conxa,
  .conxa-build-studio-dev vs .conxa-build-studio) so they coexist on one machine
  with zero interference. Endpoints/keys come from the matching .env.<env> file,
  loaded automatically by CONXA_ENV.

.EXAMPLE
  .\scripts\conxa.ps1 dev studio
  .\scripts\conxa.ps1 prod backend
#>
param(
  [Parameter(Mandatory=$true)][ValidateSet("dev","prod")][string]$Env,
  [Parameter(Mandatory=$true)][ValidateSet("backend","frontend","studio","runtime","env")][string]$Target
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# ── The single switch ────────────────────────────────────────────────────────
$env:CONXA_ENV = $Env
$env:CONXA_DEV_SKIP_AUTH = "1"

# ── Isolated path roots per lane ─────────────────────────────────────────────
if ($Env -eq "dev") {
  if (-not $env:CONXA_DIR)            { $env:CONXA_DIR            = "$HOME\.conxa-dev" }
  if (-not $env:CONXA_DATA_DIR)       { $env:CONXA_DATA_DIR       = "$env:APPDATA\Conxa-Dev" }
  if (-not $env:CONXA_APP_DIR)        { $env:CONXA_APP_DIR        = "$env:CONXA_DIR\conxa-app" }
  if (-not $env:CONXA_STUDIO_HOME)    { $env:CONXA_STUDIO_HOME    = "$HOME\.conxa-build-studio-dev" }
  if (-not $env:CONXA_UPDATE_CHANNEL) { $env:CONXA_UPDATE_CHANNEL = "dev" }
  # No .env.dev ships in the repo, so the standalone cloud backend
  # (`conxa.ps1 dev backend`) has zero LLM provider keys by default. Without
  # this, Settings() refuses to even start ("No LLM providers enabled").
  # Studio's own Python backend already gets this from main.js when Electron
  # spawns it — set it here too so `conxa.ps1 dev backend` boots standalone
  # the same way. Dev-only: prod must have real provider keys.
  if (-not $env:SKILL_ALLOW_NO_PROVIDERS) { $env:SKILL_ALLOW_NO_PROVIDERS = "1" }
  # Vision-anchor LLM calls on/off switch. Skips the anchor_vision proxy call
  # entirely and falls straight to DOM-only anchors (existing, already-recoverable
  # fallback path in build.py) instead of waiting on it. Flip to "0" once the
  # configured providers are healthy again; leave "1" while they're down/flaky.
  if (-not $env:CONXA_DISABLE_VISION_ANCHORS) { $env:CONXA_DISABLE_VISION_ANCHORS = "1" }
  # Test Skill always runs the LOCALLY BUILT runtime — never a download, ever, in
  # Dev. Run scripts\build-runtime-local.ps1 and scripts\build-app-local.ps1 (once
  # after cloning, then again after editing bootstrap.js/server.js/etc.) — they
  # write to <CONXA_STUDIO_HOME>\dev-runtime\, which
  # conxa_compile/conxa_runtime.py's resolve_runtime_dir() always resolves to for
  # a non-frozen (unpacked) Studio checkout. This mirrors the Production pipeline
  # (build -> publish -> download) except "publish/download" is just a local file
  # copy done by those two scripts.
} else {
  if (-not $env:CONXA_DIR)            { $env:CONXA_DIR            = "$HOME\.conxa" }
  if (-not $env:CONXA_DATA_DIR)       { $env:CONXA_DATA_DIR       = "$env:APPDATA\Conxa" }
  if (-not $env:CONXA_APP_DIR)        { $env:CONXA_APP_DIR        = "$env:CONXA_DIR\conxa-app" }
  if (-not $env:CONXA_STUDIO_HOME)    { $env:CONXA_STUDIO_HOME    = "$HOME\.conxa-build-studio" }
  if (-not $env:CONXA_UPDATE_CHANNEL) { $env:CONXA_UPDATE_CHANNEL = "stable" }
}

Write-Host "-- conxa [$($env:CONXA_ENV)] --------------------------------------"
Write-Host "  CONXA_DIR            = $($env:CONXA_DIR)"
Write-Host "  CONXA_DATA_DIR       = $($env:CONXA_DATA_DIR)"
Write-Host "  CONXA_STUDIO_HOME    = $($env:CONXA_STUDIO_HOME)"
Write-Host "  CONXA_UPDATE_CHANNEL = $($env:CONXA_UPDATE_CHANNEL)"
Write-Host "  env file             = .env.$($env:CONXA_ENV)"
Write-Host "-----------------------------------------------------------------"

# Dev-only sample data (a Default group plus a seeded Sales group/workflows) so
# a fresh Studio checkout has something to look at. Never runs in prod; a
# failure here is a warning, never a launch blocker — see seed_dev_data.py.
if ($Env -eq "dev" -and $Target -eq "studio") {
  try {
    python "$Root\scripts\seed_dev_data.py"
  } catch {
    Write-Host "  (seed data skipped: $_)"
  }
}

$port = if ($env:PORT) { $env:PORT } else { "8000" }

switch ($Target) {
  "env"      { break }
  "backend"  {
    Set-Location "$Root\conxa-cloud\backend"
    if ($Env -eq "dev") { python -m uvicorn app.main:app --reload --host 127.0.0.1 --port $port }
    else                { python -m uvicorn app.main:app --host 127.0.0.1 --port $port }
  }
  "frontend" {
    Set-Location "$Root\conxa-cloud\frontend"
    if ($Env -eq "dev") { npm run dev } else { npm run start }
  }
  "studio"   { Set-Location "$Root\conxa-builder\electron"; npm run dev }
  "runtime"  { Set-Location "$Root\runtime"; node server.js }
}
