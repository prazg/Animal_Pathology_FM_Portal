# One-step Windows setup for AnimalPath-FM local FastAPI runner (uses Astral uv or Python venv)
$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

Write-Host "==> Preparing AnimalPath-FM Local Backend in $RepoRoot" -ForegroundColor Cyan

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "==> Astral 'uv' not found on PATH; installing uv for standalone Python 3.11 management..." -ForegroundColor Yellow
    irm https://astral.sh/uv/install.ps1 | iex
    $env:Path = "$HOME\.local\bin;$HOME\.cargo\bin;$env:Path"
}

if (Get-Command uv -ErrorAction SilentlyContinue) {
    if (-not (Test-Path ".venv")) {
        uv venv .venv --python 3.11
    }
    uv pip install --python .venv\Scripts\python.exe -r backend\requirements-server.txt
} else {
    if (-not (Test-Path ".venv")) {
        python -m venv .venv
    }
    .\.venv\Scripts\python.exe -m pip install --upgrade pip
    .\.venv\Scripts\python.exe -m pip install -r backend\requirements-server.txt
}

if (-not (Test-Path "backend\config.yaml")) {
    Copy-Item "backend\config.example.yaml" "backend\config.yaml"
    Write-Host "==> Created backend\config.yaml from template" -ForegroundColor Green
}

Write-Host "==> Launching local FastAPI backend on http://127.0.0.1:8000 (Portal UI: http://127.0.0.1:8000/portal/index.html)" -ForegroundColor Green
.\.venv\Scripts\python.exe -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
