<#
.SYNOPSIS
  Build the real runtime host exe locally and drop it exactly where a real
  download would — so Test Skill uses the identical code path as Production.
  Dev only — never touches Production.

.DESCRIPTION
  Mirrors build-runtime-host.yml exactly: stamps runtime/package.json's version
  and host_version, runs `npm run build:win` (pkg, --no-bytecode) — but on your
  own machine, writing straight into
  <CONXA_STUDIO_HOME>\deps\conxa-runtime\<version>\ instead of publishing a
  GitHub Release. package.json is restored to its original, committed content
  afterward — this never leaves a stamped version in the working tree.

  This is the SAME folder conxa_compile/conxa_runtime.py's _bootstrap_runtime_dir()
  scans in Production (after a real download) — Test Skill's resolve_runtime_dir()
  and ensure_test_sandbox() do not know or care whether what's there was
  downloaded or built locally; the code path is identical. Only CONXA_STUDIO_HOME
  differs between Dev and Production, keeping them isolated.

  Any other version already under deps\conxa-runtime\ is deleted first, so
  there's always exactly one — deterministic, and avoids competing with a real
  download that might land there too (e.g. from clicking "Build Installer").

  Run this after editing bootstrap.js (the pkg entry point), version_manager.js,
  or env.js — anything the host exe itself statically bundles. For everything
  else (server.js, run.js, resolver.js, recovery.js, ...), use
  build-app-local.ps1 instead — those files are loaded from disk at runtime,
  not baked into the exe.

.EXAMPLE
  .\scripts\build-runtime-local.ps1
#>
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $Root "runtime"

$StudioHome = if ($env:CONXA_STUDIO_HOME) { $env:CONXA_STUDIO_HOME } else { "$HOME\.conxa-build-studio-dev" }
$DepsRoot = Join-Path $StudioHome "deps\conxa-runtime"

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$hostVersion = "host-v0.0.0-local.$stamp"
$versionDest = Join-Path $DepsRoot $hostVersion

$pkgPath = Join-Path $RuntimeDir "package.json"
$originalPkg = Get-Content $pkgPath -Raw
try {
  $pkg = $originalPkg | ConvertFrom-Json
  $pkg.version = "0.0.0-local.$stamp"
  $pkg.host_version = $hostVersion
  ($pkg | ConvertTo-Json -Depth 10) | Out-File -Encoding utf8 $pkgPath

  Write-Host "-- building conxa-runtime.exe (this takes a minute) --------------"
  Push-Location $RuntimeDir
  try { npm run build:win } finally { Pop-Location }
} finally {
  Set-Content -Path $pkgPath -Value $originalPkg -NoNewline
}

$exeSrc = Join-Path $RuntimeDir "dist\conxa-runtime.exe"
if (-not (Test-Path $exeSrc)) { Write-Error "Build failed: $exeSrc not found." }

New-Item -ItemType Directory -Force -Path $versionDest | Out-Null
Copy-Item $exeSrc (Join-Path $versionDest "conxa-runtime.exe") -Force
Copy-Item (Join-Path $RuntimeDir "node_modules\keytar\build\Release\keytar.node") (Join-Path $versionDest "keytar.node") -Force

# Only one version needed locally — drop any other (a stale local build, or a
# real download from Build Installer) so resolution is unambiguous.
if (Test-Path $DepsRoot) {
  Get-ChildItem $DepsRoot -Directory | Where-Object { $_.Name -ne $hostVersion } |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
}

Write-Host "-----------------------------------------------------------------"
Write-Host "Host exe rebuilt: $versionDest\conxa-runtime.exe"
Write-Host "  host_version = $hostVersion"
if (-not (Test-Path (Join-Path $StudioHome "deps\conxa-app"))) {
  Write-Host ""
  Write-Host "No app layer staged yet — also run .\scripts\build-app-local.ps1"
  Write-Host "before Test Skill will work."
}
Write-Host "-----------------------------------------------------------------"
