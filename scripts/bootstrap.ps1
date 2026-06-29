#!/usr/bin/env pwsh
# midcine bootstrap (English-only, UTF-8 BOM safe)

param(
    [switch]$WithLlm,
    [switch]$WithWhatsApp,
    [switch]$Fixtures,
    [switch]$Down,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if ($Down) {
    docker compose -f infra/docker/docker-compose.dev.yml --env-file .env down -v
    return
}

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "[INFO] copied .env from .env.example"
}

if ($WithWhatsApp) {
    (Get-Content .env) -replace 'WA_SIMULATE=.*', 'WA_SIMULATE=false' | Set-Content .env
} else {
    (Get-Content .env) -replace 'WA_SIMULATE=.*', 'WA_SIMULATE=true' | Set-Content .env
}

$composeArgs = @("-f", "infra/docker/docker-compose.dev.yml", "--env-file", ".env")
if ($WithLlm) { $composeArgs += @("--profile", "llm-real") }

Write-Host "[BUILD] images (5-8 min first time)..."
docker compose @composeArgs build

Write-Host "[UP] starting stack..."
docker compose @composeArgs up -d

Write-Host "[WAIT] postgres readiness..."
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    $log = docker compose @composeArgs logs postgres 2>&1
    if ($log -match "database system is ready to accept connections") { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Warning "Postgres not fully ready, continuing..." }

Write-Host "[SEED] running seed_db.py..."
if (-not (Test-Path .venv)) { python -m venv .venv }
& .\.venv\Scripts\Activate.ps1
pip install --quiet "psycopg[binary]" argon2-cffi cryptography pydicom numpy httpx watchfiles
pip install --quiet -e packages/dicom-utils 2>$null
pip install --quiet -e packages/shared-types/py 2>$null
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5433"
$env:POSTGRES_DB = "midcine"
$env:POSTGRES_USER = "midcine_app"
$env:POSTGRES_PASSWORD = "changeme_dev_only"
python scripts/seed_db.py

if ($Fixtures) {
    Write-Host "[FIXTURES] generating synthetic DICOMs..."
    python scripts/make_test_dicom.py
    Write-Host "[FIXTURES] copying ct-brain-hemorrhage to edge-pusher inbox..."
    New-Item -ItemType Directory -Force apps/edge-pusher/inbox | Out-Null
    Get-ChildItem apps/edge-pusher/inbox -Filter *.dcm -ErrorAction SilentlyContinue | Remove-Item
    Copy-Item fixtures/ct-brain-hemorrhage/*.dcm apps/edge-pusher/inbox/
    Write-Host "[PUSH] running edge-pusher once..."
    Push-Location apps/edge-pusher
    python -m app.pusher --inbox ./inbox --api http://localhost:8100 --once
    Pop-Location
}

deactivate

if ($WithLlm) {
    Write-Host "[LLM] pulling Ollama model qwen2.5:3b-instruct-q4_K_M (~4GB)..."
    docker exec midcine-ollama ollama pull qwen2.5:3b-instruct-q4_K_M
    (Get-Content .env) -replace 'LLM_BACKEND=.*', 'LLM_BACKEND=ollama' | Set-Content .env
    docker compose @composeArgs restart llm-service
}

Write-Host ""
Write-Host "[READY] midcine is up." -ForegroundColor Green
Write-Host ""
Write-Host "  Web        : http://localhost:3000   (demo@midcine.io / DemoMidcine!2026)"
Write-Host "  API docs   : http://localhost:8100/docs"
Write-Host "  FHIR R4    : http://localhost:8400/fhir/R4/DiagnosticReport"
Write-Host "  Orthanc UI : http://localhost:8042   (midcine / changeme_dev_only)"
Write-Host "  MinIO UI   : http://localhost:9001   (midcine-dev / midcine-dev-secret-change-me)"
Write-Host "  OHIF       : http://localhost:3030"
Write-Host "  WhatsApp QR: http://localhost:8500/qr   (if -WithWhatsApp)"
Write-Host "  DICOM SCP  : port 11113 AET=MIDCINE"
Write-Host ""

if ($Logs) {
    docker compose @composeArgs logs -f --tail=50
}