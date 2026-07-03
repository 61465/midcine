# DISABLED — midcine is local-only.
#
# The Tailscale Funnel URL ame.tail19ddab.ts.net:8445 belongs to the thawani-v2
# ("ثواني") project on this machine. midcine must not share it.
#
# If you later deploy midcine to a hospital edge box, create a NEW script per
# hospital (deploy-edge-<hospital>.ps1) with the hospital's own hostname.
#
# To run midcine locally:
#   1. .\scripts\start-mcp-bridge.ps1   # backend on :8210
#   2. pnpm --filter @midcine/web dev   # frontend on :3000
#   3. open http://localhost:3000

Write-Host "midcine is local-only. This deploy script is intentionally disabled." -ForegroundColor Yellow
Write-Host "Open http://localhost:3000 after starting the web + bridge locally." -ForegroundColor Cyan
exit 0
