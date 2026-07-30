#!/usr/bin/env bash
# Conxa Build Studio — macOS / Linux developer setup
# Run once after cloning: ./scripts/setup.sh
# Requires: Python 3.11+, Node.js 20+
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

step() { echo ""; echo "==> $1"; }

# ── Track A: Python (conxa-core → Build Studio deps → Playwright Chromium) ────
# ── Track B: Electron / renderer (Node dependencies) ──────────────────────────
# ── Track C: Runtime (Node dependencies) ──────────────────────────────────────
# Tracks are independent (different toolchains/lockfiles) so they run concurrently.
step "Installing Python deps, Playwright Chromium, and Node deps in parallel"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

(
    set -euo pipefail
    python3 -m pip install -e "$ROOT/packages/conxa-core" --quiet
    python3 -m pip install -r "$ROOT/conxa-builder/python/requirements.txt" --quiet
    python3 -m playwright install chromium
) >"$WORKDIR/python.log" 2>&1 &
PYTHON_PID=$!

(
    set -euo pipefail
    cd "$ROOT/conxa-builder/electron"
    npm install --silent
) >"$WORKDIR/electron.log" 2>&1 &
ELECTRON_PID=$!

(
    set -euo pipefail
    cd "$ROOT/runtime"
    npm install --silent
) >"$WORKDIR/runtime.log" 2>&1 &
RUNTIME_PID=$!

FAILED=0

wait "$PYTHON_PID" || { echo "==> FAILED: Python (conxa-core, Build Studio deps, Playwright Chromium)"; FAILED=1; }
cat "$WORKDIR/python.log"

wait "$ELECTRON_PID" || { echo "==> FAILED: Electron dependencies"; FAILED=1; }
cat "$WORKDIR/electron.log"

wait "$RUNTIME_PID" || { echo "==> FAILED: Runtime dependencies"; FAILED=1; }
cat "$WORKDIR/runtime.log"

if [ "$FAILED" -ne 0 ]; then
    echo ""
    echo "Setup failed — see errors above."
    exit 1
fi

echo ""
echo "Setup complete."
echo ""
echo "To start the dev server:"
echo "  cd conxa-builder/electron && npm run dev"
echo ""
echo "To build the Studio installer:"
echo "  1. pyinstaller conxa-builder/pyinstaller.spec --noconfirm"
echo "  2. cd conxa-builder/electron && npm run build"
echo ""
echo "To build the runtime (requires NASM + VS Build Tools on Windows):"
echo "  cd runtime && npm run build:win   # or build:mac"
