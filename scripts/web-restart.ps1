# Clean web restart — kill any running server, purge .next, rebuild, start fresh.
# Prevents the "CSS 500 error" caused by stale build assets after live rebuilds.
#
# Run: powershell -ExecutionPolicy Bypass -File scripts\web-restart.ps1
$ErrorActionPreference = 'Continue'

$root = 'D:\project\midcine'
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $logDir "web-$stamp.log"

Write-Host "== [1/4] Kill any node on :3000 ==" -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique |
    ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        Write-Host "  killed PID $_" -ForegroundColor DarkGray
    }
Start-Sleep -Seconds 1

Write-Host "== [2/4] Purge .next cache ==" -ForegroundColor Cyan
Remove-Item -Recurse -Force (Join-Path $root 'apps\web\.next') -ErrorAction SilentlyContinue
Write-Host "  removed .next" -ForegroundColor DarkGray

Write-Host "== [3/4] Fresh build ==" -ForegroundColor Cyan
Set-Location $root
$build = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c','pnpm','--filter','@midcine/web','build' `
    -WorkingDirectory $root -Wait -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput "$log.build" -RedirectStandardError "$log.build.err"
if ($build.ExitCode -ne 0) {
    Write-Host "  BUILD FAILED — see $log.build.err" -ForegroundColor Red
    Get-Content "$log.build.err" -Tail 15
    exit 1
}
Write-Host "  build OK" -ForegroundColor Green

Write-Host "== [4/4] Start production server ==" -ForegroundColor Cyan
Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c','pnpm','--filter','@midcine/web','start' `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err" | Out-Null

Write-Host "  waiting for readiness..." -ForegroundColor DarkGray
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest 'http://localhost:3000/' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            Write-Host "  ready in $(($i+1)*2)s" -ForegroundColor Green
            break
        }
    } catch {}
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  midcine web ready" -ForegroundColor Green
Write-Host "  URL:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  log:  $log" -ForegroundColor DarkGray
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "TIP: hard-reload the browser (Ctrl+Shift+R) to clear stale CSS cache" -ForegroundColor Yellow
