# Start midcine mcp-bridge locally on port 8210.
# Uses Naraya (mistral-large) as the NEXUS backend.
$ErrorActionPreference = 'Stop'

$root = 'D:\project\midcine\services\mcp-bridge'
$port = 8210

Set-Location $root

# Ensure venv
if (-not (Test-Path .\.venv)) {
    Write-Host "Creating venv..." -ForegroundColor Cyan
    python -m venv .venv
}

# Install deps
Write-Host "Installing dependencies..." -ForegroundColor Cyan
& .\.venv\Scripts\python.exe -m pip install --quiet --disable-pip-version-check -r requirements.txt

# Kill anything on the port
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    $existing.OwningProcess | Sort-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        Write-Host "Killed PID $_ on port $port"
    }
    Start-Sleep -Seconds 1
}

# Load Naraya key into current process
$env:NARAYA_API_KEY = [System.Environment]::GetEnvironmentVariable('NARAYA_API_KEY', 'User')
if (-not $env:NARAYA_API_KEY) {
    Write-Error "NARAYA_API_KEY missing from User env"
    exit 1
}

Write-Host "Starting uvicorn on http://localhost:$port ..." -ForegroundColor Green
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port $port --reload
