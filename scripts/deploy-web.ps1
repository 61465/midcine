# midcine web deploy — mobeface pattern adapted (borrowed from D:\project\mobeface\start-backend.ps1)
# Builds apps/web, starts on :3000 in background, opens Tailscale Funnel on :8445, verifies.
# Idempotent: kills existing process on 3000 first, resets funnel first.
#
# Run: powershell -ExecutionPolicy Bypass -File D:\project\midcine\scripts\deploy-web.ps1
$ErrorActionPreference = 'Stop'

$root       = 'D:\project\midcine'
$webFilter  = '@midcine/web'
$localPort  = 3000
$funnelPort = 8445
$tailscale  = 'C:\Program Files\Tailscale\tailscale.exe'

Set-Location $root

# 1) Kill anything on port 3000
Write-Host "== Freeing port $localPort ==" -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort $localPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique |
    ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        Write-Host "  killed PID $_" -ForegroundColor DarkGray
    }
Start-Sleep -Seconds 1

# 2) Build (Next.js production)
Write-Host "== Building $webFilter ==" -ForegroundColor Cyan
pnpm --filter $webFilter build
if ($LASTEXITCODE -ne 0) {
    Write-Error "pnpm build failed (exit $LASTEXITCODE)"
    exit 1
}

# 3) Start in background
Write-Host "== Starting web on http://localhost:$localPort ==" -ForegroundColor Cyan
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "web-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

# Windows: pnpm is a .cmd shim, must be invoked via cmd.exe so Start-Process can find it.
$proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'pnpm', '--filter', $webFilter, 'start', '--', '-p', $localPort `
    -WorkingDirectory $root `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"

Write-Host "  pnpm start PID $($proc.Id), log: $logFile" -ForegroundColor DarkGray

# 4) Wait for readiness
Write-Host "== Waiting for web on port $localPort ==" -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest "http://localhost:$localPort/" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
if (-not $ready) {
    Write-Error "Web did not respond on :$localPort within 60s. See $logFile"
    exit 1
}
Write-Host "  web READY" -ForegroundColor Green

# 5) Probe mcp-bridge (soft: warn only)
Write-Host "== Probing mcp-bridge :8210 ==" -ForegroundColor Cyan
try {
    $h = Invoke-RestMethod 'http://localhost:8210/health' -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  bridge status=$($h.status) backend=$($h.backend) reachable=$($h.backend_reachable)" -ForegroundColor Green
} catch {
    Write-Warning "  mcp-bridge NOT UP — reader will surface bridge_unreachable. Run scripts\start-mcp-bridge.ps1 in another window."
}

# 6) Reset + open Tailscale Funnel
if (-not (Test-Path $tailscale)) {
    Write-Error "Tailscale CLI not at $tailscale"
    exit 1
}
Write-Host "== Resetting Tailscale Funnel on :$funnelPort ==" -ForegroundColor Cyan
& $tailscale funnel --https=$funnelPort off 2>$null | Out-Null
& $tailscale funnel --bg --https=$funnelPort --set-path=/ "http://localhost:$localPort"

Start-Sleep -Seconds 2

# 7) Verify public URL
$publicUrl = "https://ame.tail19ddab.ts.net:$funnelPort"
Write-Host "== Verifying $publicUrl ==" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest $publicUrl -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Host "  public OK ($($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Warning "  public probe failed: $_"
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host "  midcine v3 LIVE" -ForegroundColor Green
Write-Host "  public : $publicUrl" -ForegroundColor Cyan
Write-Host "  local  : http://localhost:$localPort" -ForegroundColor Cyan
Write-Host "  bridge : http://localhost:8210 (health, dispatch, aggregate, pipeline)" -ForegroundColor Cyan
Write-Host "  logs   : $logFile" -ForegroundColor DarkGray
Write-Host "===============================================" -ForegroundColor Green
Write-Host ""
Write-Host "== Funnel status ==" -ForegroundColor Cyan
& $tailscale funnel status
