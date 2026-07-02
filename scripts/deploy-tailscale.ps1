# Deploy midcine web + mcp-bridge behind Tailscale Funnel.
#   Web        : localhost:3000 → https://ame.tail19ddab.ts.net:8445
#   mcp-bridge : localhost:8210 (internal, not funneled)
#
# Assumes:
#   - Tailscale installed at "C:\Program Files\Tailscale\tailscale.exe"
#   - `tailscale up` already done
$ErrorActionPreference = 'Stop'

$tailscale  = 'C:\Program Files\Tailscale\tailscale.exe'
$funnelPort = 8445
$localPort  = 3000

if (-not (Test-Path $tailscale)) {
    Write-Error "Tailscale CLI not found at $tailscale"
    exit 1
}

Write-Host "== Health probe: localhost:$localPort ==" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest "http://localhost:$localPort/" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "  web OK ($($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Error "Web app not responding on localhost:$localPort. Start `pnpm --filter @midcine/web dev` first."
    exit 1
}

Write-Host "== Health probe: mcp-bridge localhost:8210 ==" -ForegroundColor Cyan
try {
    $r = Invoke-RestMethod "http://localhost:8210/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  bridge status: $($r.status) · backend: $($r.backend) · reachable: $($r.backend_reachable)" -ForegroundColor Green
} catch {
    Write-Warning "mcp-bridge not up on 8210. Reader will fall back to stub. Start with scripts/start-mcp-bridge.ps1"
}

Write-Host "== Resetting Tailscale Funnel on port $funnelPort ==" -ForegroundColor Cyan
& $tailscale funnel --https=$funnelPort off 2>$null | Out-Null
& $tailscale funnel --bg --https=$funnelPort --set-path=/ "http://localhost:$localPort"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "✅ midcine live" -ForegroundColor Green
Write-Host "   Public : https://ame.tail19ddab.ts.net:$funnelPort" -ForegroundColor Cyan
Write-Host "   Local  : http://localhost:$localPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "== Funnel status ==" -ForegroundColor Cyan
& $tailscale funnel status
