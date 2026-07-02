#!/usr/bin/env bash
# ============================================================================
# conxa — the single dev/prod switch (macOS / Linux)
# ============================================================================
# Usage:
#   ./scripts/conxa.sh <dev|prod> <backend|frontend|studio|runtime|env>
#
# Exports CONXA_ENV plus the isolated path roots for the chosen lane, then
# launches the target. Dev and Prod use completely separate trees
# (~/.conxa-dev vs ~/.conxa, ~/.conxa-build-studio-dev vs ~/.conxa-build-studio)
# so they coexist on one machine with zero interference. Endpoints/keys come
# from the matching .env.<env> file, loaded automatically by CONXA_ENV.
#
#   env      Print the resolved environment and exit (dry run — no launch).
#   backend  Run the cloud FastAPI backend locally.
#   frontend Run the Next.js dashboard locally.
#   studio   Run the Build Studio (Electron + Python).
#   runtime  Run the MCP runtime (node server.js).
set -euo pipefail

ENV="${1:-}"
TARGET="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "$ENV" in
  dev|prod) ;;
  *) echo "Usage: $0 <dev|prod> <backend|frontend|studio|runtime|env>"; exit 2 ;;
esac

# ── The single switch ────────────────────────────────────────────────────────
export CONXA_ENV="$ENV"

# ── Isolated path roots per lane ─────────────────────────────────────────────
if [ "$ENV" = "dev" ]; then
  export CONXA_DIR="${CONXA_DIR:-$HOME/.conxa-dev}"
  export CONXA_DATA_DIR="${CONXA_DATA_DIR:-$CONXA_DIR/data}"
  export CONXA_APP_DIR="${CONXA_APP_DIR:-$CONXA_DIR/conxa-app}"
  export CONXA_STUDIO_HOME="${CONXA_STUDIO_HOME:-$HOME/.conxa-build-studio-dev}"
  export CONXA_UPDATE_CHANNEL="${CONXA_UPDATE_CHANNEL:-dev}"
else
  export CONXA_DIR="${CONXA_DIR:-$HOME/.conxa}"
  export CONXA_DATA_DIR="${CONXA_DATA_DIR:-$CONXA_DIR/data}"
  export CONXA_APP_DIR="${CONXA_APP_DIR:-$CONXA_DIR/conxa-app}"
  export CONXA_STUDIO_HOME="${CONXA_STUDIO_HOME:-$HOME/.conxa-build-studio}"
  export CONXA_UPDATE_CHANNEL="${CONXA_UPDATE_CHANNEL:-stable}"
fi

echo "── conxa [$CONXA_ENV] ──────────────────────────────────────────"
echo "  CONXA_DIR            = $CONXA_DIR"
echo "  CONXA_DATA_DIR       = $CONXA_DATA_DIR"
echo "  CONXA_STUDIO_HOME    = $CONXA_STUDIO_HOME"
echo "  CONXA_UPDATE_CHANNEL = $CONXA_UPDATE_CHANNEL"
echo "  env file             = .env.$CONXA_ENV"
echo "────────────────────────────────────────────────────────────────"

case "$TARGET" in
  env)
    exit 0 ;;
  backend)
    cd "$ROOT/conxa-cloud/backend"
    if [ "$ENV" = "dev" ]; then
      exec python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port "${PORT:-8000}"
    else
      exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}"
    fi ;;
  frontend)
    cd "$ROOT/conxa-cloud/frontend"
    if [ "$ENV" = "dev" ]; then exec npm run dev; else exec npm run start; fi ;;
  studio)
    cd "$ROOT/conxa-builder/electron"; exec npm run dev ;;
  runtime)
    cd "$ROOT/runtime"; exec node server.js ;;
  *)
    echo "Unknown target: '$TARGET' (expected backend|frontend|studio|runtime|env)"; exit 2 ;;
esac
