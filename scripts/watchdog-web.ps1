# midcine web watchdog — inspired by mobeface + mostqlworkwatssap patterns.
# Every 60s: probe web + mcp-bridge. On failure, auto-restart via deploy-web.ps1 / start-mcp-bridge.ps1.
# Log to logs/watchdog-YYYYMMDD.log.
# Run: powershell -ExecutionPolicy Bypass -File D:\project\midcine\scripts\watchdog-web.ps1
$ErrorActionPreference = 'Continue'

$root       = 'D:\project\midcine'
$logDir     = Join-Path $root 'logs'
$intervalS  = 60
$webUrl     = 'http://localhost:3000/'
$bridgeUrl  = 'http://localhost:8210/health'
$publicUrl  = 'https://ame.tail19ddab.ts.net:8445/'

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("watchdog-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))

function Write-Log($msg) {
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    $line | Tee-Object -FilePath $logFile -Append | Out-Host
}

function Probe($url) {
    try {
        $r = Invoke-WebRequest $url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return @{ ok = ($r.StatusCode -lt 400); code = $r.StatusCode }
    } catch {
        return @{ ok = $false; code = 0; error = $_.Exception.Message }
    }
}

Write-Log "watchdog START — interval=${intervalS}s"

while ($true) {
    $web    = Probe $webUrl
    $bridge = Probe $bridgeUrl
    $pub    = Probe $publicUrl

    $summary = "web={0} bridge={1} pub={2}" -f `
        ($(if($web.ok)   {"OK"} else {"DOWN($($web.code))"})),
        ($(if($bridge.ok){"OK"} else {"DOWN($($bridge.code))"})),
        ($(if($pub.ok)   {"OK"} else {"DOWN($($pub.code))"}))
    Write-Log $summary

    if (-not $web.ok) {
        Write-Log "  ↳ web down, invoking deploy-web.ps1"
        try {
            & (Join-Path $root 'scripts\deploy-web.ps1')
        } catch {
            Write-Log "  ↳ deploy-web failed: $_"
        }
    }

    if (-not $bridge.ok) {
        Write-Log "  ↳ mcp-bridge down, invoking start-mcp-bridge.ps1 (background)"
        try {
            Start-Process -FilePath 'powershell.exe' `
                -ArgumentList '-NoProfile','-WindowStyle','Hidden','-File',(Join-Path $root 'scripts\start-mcp-bridge.ps1') `
                -WindowStyle Hidden | Out-Null
        } catch {
            Write-Log "  ↳ start-mcp-bridge invocation failed: $_"
        }
    }

    Start-Sleep -Seconds $intervalS
}
