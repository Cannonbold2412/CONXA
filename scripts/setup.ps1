# Conxa Build Studio — Windows developer setup
# Run once after cloning: .\scripts\setup.ps1
# Requires: Python 3.11+, Node.js 20+
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot

function Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

# ── Track A: Python (conxa-core → Build Studio deps → Playwright Chromium) ────
# ── Track B: Electron / renderer (Node dependencies) ──────────────────────────
# ── Track C: Runtime (Node dependencies) ──────────────────────────────────────
# Tracks are independent (different toolchains/lockfiles) so they run concurrently.
Step "Installing Python deps, Playwright Chromium, and Node deps in parallel"

$pythonJob = Start-Job -ScriptBlock {
    param($Root)
    python -m pip install -e "$Root\packages\conxa-core" --quiet
    if ($LASTEXITCODE -ne 0) { throw "conxa-core install failed" }
    python -m pip install -r "$Root\conxa-builder\python\requirements.txt" --quiet
    if ($LASTEXITCODE -ne 0) { throw "Build Studio Python deps install failed" }
    python -m playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw "Playwright Chromium install failed" }
} -ArgumentList $Root

$electronJob = Start-Job -ScriptBlock {
    param($Root)
    Set-Location "$Root\conxa-builder\electron"
    npm install --silent
    if ($LASTEXITCODE -ne 0) { throw "Electron npm install failed" }
} -ArgumentList $Root

$runtimeJob = Start-Job -ScriptBlock {
    param($Root)
    Set-Location "$Root\runtime"
    npm install --silent
    if ($LASTEXITCODE -ne 0) { throw "Runtime npm install failed" }
} -ArgumentList $Root

$jobs = @(
    @{ Name = "Python (conxa-core, Build Studio deps, Playwright Chromium)"; Job = $pythonJob },
    @{ Name = "Electron dependencies"; Job = $electronJob },
    @{ Name = "Runtime dependencies"; Job = $runtimeJob }
)

Wait-Job -Job $jobs.Job | Out-Null

$failed = $false
foreach ($entry in $jobs) {
    $output = Receive-Job -Job $entry.Job -ErrorVariable jobError 2>&1
    $output | ForEach-Object { Write-Host $_ }
    if ($entry.Job.State -eq "Failed" -or $jobError) {
        Write-Host "==> FAILED: $($entry.Name)" -ForegroundColor Red
        $failed = $true
    }
    Remove-Job -Job $entry.Job
}

if ($failed) {
    Write-Host ""
    Write-Host "Setup failed — see errors above." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "To start the dev server:"
Write-Host "  cd conxa-builder\electron"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "To build the Studio installer:"
Write-Host "  1. pyinstaller conxa-builder\pyinstaller.spec --noconfirm"
Write-Host "  2. cd conxa-builder\electron && npm run build"
Write-Host ""
Write-Host "To build the runtime (requires NASM + VS Build Tools):"
Write-Host "  cd runtime && npm run build:win"
