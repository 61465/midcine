# midcine Edge Bundle launcher (adapted from D:\project\mobeface\start-backend.ps1)
# Run: powershell -ExecutionPolicy Bypass -File D:\project\midcine\scripts\start-edge.ps1
$ErrorActionPreference = 'Stop'

$root        = 'D:\project\midcine'
$composeFile = Join-Path $root 'infra\docker\edge-bundle.yml'
$envFile     = Join-Path $root '.env'
$tailscale   = 'C:\Program Files\Tailscale\tailscale.exe'
$funnelPort  = 8443

if (-not (Test-Path $composeFile)) {
    Write-Error "edge-bundle.yml not found at $composeFile"
    exit 1
}
if (-not (Test-Path $envFile)) {
    Write-Warning ".env not found at $envFile — using defaults from edge-bundle.yml"
}

Set-Location $root

# 1) Stop any existing stack
Write-Host "[1/5] Stopping existing edge stack..." -ForegroundColor Cyan
docker compose -f $composeFile --project-directory $root down 2>&1 | Out-Host

# 2) Build + start
Write-Host "[2/5] Building + starting edge bundle..." -ForegroundColor Cyan
docker compose -f $composeFile --project-directory $root up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose up failed (exit $LASTEXITCODE)"
    exit 1
}

# 3) Wait for Orthanc
Write-Host "[3/5] Waiting for Orthanc health..." -ForegroundColor Cyan
$max = 30
for ($i = 1; $i -le $max; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:8042/system' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -lt 500) {
            Write-Host "  Orthanc responding after $($i*2)s" -ForegroundColor Green
            break
        }
    } catch {
        if ($i -eq $max) {
            Write-Error "Orthanc not responding after ${max}x2s"
            exit 1
        }
    }
}

# 4) Reset Tailscale Funnel on $funnelPort → local Caddy 8443
Write-Host "[4/5] Resetting Tailscale Funnel on port $funnelPort..." -ForegroundColor Cyan
if (Test-Path $tailscale) {
    & $tailscale funnel --https=$funnelPort off 2>$null | Out-Null
    & $tailscale funnel --bg --https=$funnelPort --set-path=/ "https://localhost:$funnelPort"
} else {
    Write-Warning "Tailscale CLI not found at $tailscale — skipping Funnel setup"
}

# 5) Print success
Write-Host ""
Write-Host "[5/5] OK — midcine edge live" -ForegroundColor Green
Write-Host "  Web UI         : http://localhost:3000  (midcine is local-only)" -ForegroundColor Cyan
Write-Host "  Local Caddy    : https://localhost:8443" -ForegroundColor Cyan
Write-Host "  Orthanc direct : http://localhost:8042" -ForegroundColor Cyan
Write-Host "  MinIO console  : http://localhost:9001" -ForegroundColor Cyan
Write-Host "  DICOM SCP      : localhost:11113  (AET=MIDCINE)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test C-STORE from another machine:" -ForegroundColor Yellow
Write-Host "  storescu -aec MIDCINE -aet TESTCT <edge-host> 11113 *.dcm" -ForegroundColor Gray
