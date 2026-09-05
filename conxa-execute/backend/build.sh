#!/usr/bin/env bash
# Backend build script for Render. Run with root directory = conxa-execute/backend.
# The whole repo is cloned, so the shared foundation is reachable at ../../packages/conxa-core.
set -euo pipefail

echo "=== Upgrading pip ==="
python -m pip install --upgrade pip

echo "=== Installing shared foundation (conxa-core) ==="
python -m pip install ../../packages/conxa-core

echo "=== Installing conxa-execute backend dependencies ==="
python -m pip install -r requirements.txt

echo "=== Build complete ==="
