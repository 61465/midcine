# midcine web — local build + start on :3000. NO tailscale funnel.
#
# The Tailscale Funnel ame.tail19ddab.ts.net:8445 is reserved for thawani-v2.
# midcine is local-only during pilot. Access via http://localhost:3000.
#
# Idempotent: kills existing :3000 process first.
# Run: powershell -ExecutionPolicy Bypass -File D:\project\midcine\scripts\deploy-web.ps1
$ErrorActionPreference = 'Stop'

$root       = 'D:\project\midcine'
$webFilter  = '@midcine/web'
$localPort  = 3000

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

# 2) Build
Write-Host "== Building $webFilter ==" -ForegroundColor Cyan
pnpm --filter $webFilter build
if ($LASTEXITCODE -ne 0) {
    Write-Error "pnpm build failed (exit $LASTEXITCODE)"
    exit 1
}

# 3) Start production server
Write-Host "== Starting web on http://localhost:$localPort ==" -ForegroundColor Cyan
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("web-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

# Windows: pnpm is a .cmd shim, invoke via cmd.exe.
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
    Write-Warning "  mcp-bridge NOT UP — reader will surface bridge_unreachable. Run scripts\start-mcp-bridge.ps1."
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host "  midcine LOCAL — no external URL" -ForegroundColor Green
Write-Host "  web    : http://localhost:$localPort" -ForegroundColor Cyan
Write-Host "  bridge : http://localhost:8210" -ForegroundColor Cyan
Write-Host "  logs   : $logFile" -ForegroundColor DarkGray
Write-Host "===============================================" -ForegroundColor Green
