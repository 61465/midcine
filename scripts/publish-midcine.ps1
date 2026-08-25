# Publishes midcine on Tailscale Funnel (public HTTPS on ame.tail19ddab.ts.net)
# Bindings:
#   :443    -> localhost:3000  (midcine web — Next.js)
#   Note: bridge on :8210 is accessed internally via Next.js /api/mcp/* proxies,
#         so the doctor only needs the one HTTPS URL.

# Start bridge if not running
$bridge = Get-NetTCPConnection -LocalPort 8210 -State Listen -ErrorAction SilentlyContinue
if (-not $bridge) {
    Write-Host "Starting bridge..."
    Push-Location 'D:\project\midcine\services\mcp-bridge'
    Start-Process -WindowStyle Hidden -FilePath '.\.venv\Scripts\python.exe' `
        -ArgumentList '-m','uvicorn','app.main:app','--port','8210','--host','127.0.0.1'
    Pop-Location
    Start-Sleep 4
}

# Start web if not running
$web = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $web) {
    Write-Host "Starting web..."
    Push-Location 'D:\project\midcine\apps\web'
    Start-Process -WindowStyle Hidden -FilePath 'npm' -ArgumentList 'run','start'
    Pop-Location
    Start-Sleep 6
}

# Bind Tailscale Funnel (port 443 = default)
tailscale funnel --bg 3000

Write-Host ""
Write-Host "==========================================="
Write-Host " midcine is LIVE at:"
Write-Host "   https://ame.tail19ddab.ts.net/"
Write-Host "==========================================="
