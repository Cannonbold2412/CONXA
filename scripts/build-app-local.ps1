<#
.SYNOPSIS
  Build the real (obfuscated) runtime app layer locally and drop it exactly
  where a real download would — so Test Skill uses the identical code path as
  Production. Dev only — never touches Production.

.DESCRIPTION
  Mirrors build-runtime-app.yml exactly: same file list, same javascript-obfuscator
  flags (including auth_manager.js's no-self-defending exception), same
  version.json shape (app_version, min_host, built_at, per-file sha256) — but on
  your own machine, writing straight into
  <CONXA_STUDIO_HOME>\deps\conxa-app\<version>\ instead of publishing a GitHub
  Release.

  This is the SAME folder conxa_compile/conxa_runtime.py's _bootstrap_app_dir()
  scans in Production (after a real download) — Test Skill's ensure_test_sandbox()
  copies whatever's here into the sandbox and creates the `current` junction
  itself (stage_runtime_payload(), same code either way); this script does NOT
  create a `current` junction here, matching the flat shape a downloaded app
  layer has before staging.

  Any other version already under deps\conxa-app\ is deleted first, so there's
  always exactly one — deterministic, and avoids competing with a real download
  that might land there too (e.g. from clicking "Build Installer").

  Run this after editing server.js, run.js, resolver.js, recovery.js, or any
  other app-layer file. For bootstrap.js itself (the packed exe's own entry
  point) use build-runtime-local.ps1 instead — an obfuscated copy of
  bootstrap.js ships here too (matching build-runtime-app.yml's file list
  exactly), but it is never actually loaded from here; the pkg-baked copy
  inside conxa-runtime.exe is what runs.

  Requires build-runtime-local.ps1 to have been run at least once (for the host
  exe) — this script only touches the app layer.

.EXAMPLE
  .\scripts\build-app-local.ps1
#>
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $Root "runtime"

$StudioHome = if ($env:CONXA_STUDIO_HOME) { $env:CONXA_STUDIO_HOME } else { "$HOME\.conxa-build-studio-dev" }
$DepsRoot = Join-Path $StudioHome "deps\conxa-app"

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$appVersion = "app-v0.0.0-local.$stamp"
$versionDest = Join-Path $DepsRoot $appVersion
New-Item -ItemType Directory -Force -Path $versionDest | Out-Null

Write-Host "-- obfuscating app layer -------------------------------------------"
$files = @(
  "server.js", "sync.js", "run.js", "browser.js",
  "skill_loader.js", "tracker.js", "install_identity.js",
  "bootstrap.js", "recovery.js", "resolve_adapter.js", "resolver.js",
  "drift.js", "version_manager.js", "manifest_manager.js", "auth_manager.js",
  "http_client.js", "page_scripts.js",
  # sync.js -> durable_context.js -> config_edit.js/mcp_hosts.js (mirrors
  # build-runtime-app.yml's file list — must stay in lockstep with it)
  "durable_context.js", "config_edit.js", "mcp_hosts.js"
)
$hashes = @{}
foreach ($f in $files) {
  $src = Join-Path $RuntimeDir $f
  $out = Join-Path $versionDest $f
  # page_scripts.js holds functions Playwright serializes into the browser page realm —
  # string-array/self-defending inject a module-scope ref that doesn't exist once re-parsed
  # there (see runtime/page_scripts.js header). auth_manager.js needs no-self-defending for
  # its native-module (process.dlopen) patterns.
  if ($f -eq "page_scripts.js") {
    npx --yes javascript-obfuscator $src `
      --output $out `
      --compact true `
      --identifier-names-generator mangled `
      --string-array false `
      --dead-code-injection false `
      --debug-protection false `
      --self-defending false
    $hashes[$f] = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
    continue
  }
  $selfDefending = if ($f -eq "auth_manager.js") { "false" } else { "true" }
  npx --yes javascript-obfuscator $src `
    --output $out `
    --compact true `
    --self-defending $selfDefending `
    --identifier-names-generator mangled `
    --string-array true `
    --string-array-encoding rc4 `
    --string-array-rotate true `
    --string-array-shuffle true `
    --string-array-threshold 0.75 `
    --dead-code-injection false `
    --debug-protection false
  $hashes[$f] = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
}

@{
  app_version = $appVersion
  min_host    = "0.0.0"
  built_at    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  files       = $hashes
} | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 (Join-Path $versionDest "version.json")

# Only one version needed locally — drop any other (a stale local build, or a
# real download from Build Installer) so resolution is unambiguous.
Get-ChildItem $DepsRoot -Directory | Where-Object { $_.Name -ne $appVersion } |
  ForEach-Object { Remove-Item $_.FullName -Recurse -Force }

Write-Host "-----------------------------------------------------------------"
Write-Host "App layer rebuilt: $versionDest"
if (-not (Test-Path (Join-Path $StudioHome "deps\conxa-runtime"))) {
  Write-Host ""
  Write-Host "No host exe staged yet — also run .\scripts\build-runtime-local.ps1"
  Write-Host "before Test Skill will work."
}
Write-Host ""
Write-Host "Next Test Skill run will re-stage the sandbox with this build (see"
Write-Host "ensure_test_sandbox() in conxa_compile/conxa_runtime.py)."
Write-Host "-----------------------------------------------------------------"
