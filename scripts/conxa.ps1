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

# ── Isolated path roots per lane ─────────────────────────────────────────────
if ($Env -eq "dev") {
  if (-not $env:CONXA_DIR)            { $env:CONXA_DIR            = "$HOME\.conxa-dev" }
  if (-not $env:CONXA_DATA_DIR)       { $env:CONXA_DATA_DIR       = "$env:APPDATA\Conxa-Dev" }
  if (-not $env:CONXA_APP_DIR)        { $env:CONXA_APP_DIR        = "$env:CONXA_DIR\conxa-app" }
  if (-not $env:CONXA_STUDIO_HOME)    { $env:CONXA_STUDIO_HOME    = "$HOME\.conxa-build-studio-dev" }
  if (-not $env:CONXA_UPDATE_CHANNEL) { $env:CONXA_UPDATE_CHANNEL = "dev" }
  # Opt-in: download the real host exe + app layer (like a customer install) instead of
  # running the repo-local runtime/ source tree. Set CONXA_FORCE_DEPS="" before calling
  # this script to fall back to the fast local-source dev loop.
  if (-not $env:CONXA_FORCE_DEPS)     { $env:CONXA_FORCE_DEPS     = "1" }
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
Write-Host "  CONXA_FORCE_DEPS     = $($env:CONXA_FORCE_DEPS)"
Write-Host "  env file             = .env.$($env:CONXA_ENV)"
Write-Host "-----------------------------------------------------------------"

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
