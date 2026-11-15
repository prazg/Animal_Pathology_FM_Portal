$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
