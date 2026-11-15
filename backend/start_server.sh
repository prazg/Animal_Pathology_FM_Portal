#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec python3 -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
