#!/usr/bin/env bash
# One-step macOS / Linux setup for AnimalPath-FM local FastAPI runner
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Preparing AnimalPath-FM Local Backend in $REPO_ROOT"

if command -v uv >/dev/null 2>&1; then
  [ -d ".venv" ] || uv venv .venv --python 3.11
  uv pip install --python .venv/bin/python -r backend/requirements-server.txt
else
  [ -d ".venv" ] || python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r backend/requirements-server.txt
fi

if [ ! -f "backend/config.yaml" ]; then
  cp backend/config.example.yaml backend/config.yaml
  echo "==> Created backend/config.yaml from template"
fi

echo "==> Launching local FastAPI backend on http://127.0.0.1:8000"
exec .venv/bin/python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
