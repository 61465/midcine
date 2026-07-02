# Direct Naraya call for the midcine architect persona.
# Bypasses MCP → no Claude tokens spent for the architect's reasoning.
# Output goes to naraya-out/architect-YYYYMMDD-HHmmss.md
$ErrorActionPreference = 'Stop'

$scripts = 'D:\project\comp\cyberlab\scripts'
$outDir  = 'D:\project\midcine\naraya-out'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $outDir "architect-$stamp.md"

$systemPrompt = @'
You are the lead architect for midcine, an Arabic-first RIS/PACS platform.

CONTEXT:
- Repo: D:\project\midcine (git initialized, tag pre-v3-refactor-2026-06-29 exists)
- v3 refactor DONE (2026-06-30): 7 Next.js apps collapsed to apps/web, 5 v12 services deleted, mcp-bridge scaffold created at services/mcp-bridge with stub main.py + dispatch_rules.yaml
- Prototype services already RUN (infra/docker/docker-compose.dev.yml): postgres+paradedb, redis, minio, orthanc, ingestion-api (FastAPI 8100), ai-worker, llm-service (8300), fhir-gateway (8400), dicom-receiver (11113), whatsapp-bridge (8500)
- New: infra/docker/edge-bundle.yml exists for on-prem NUC
- apps/web SHIPPED: 7 routes + /anatomy lab (4 organs 3D+SVG+waveform + BioDigital atlas). React 19 + Next 15 (webpack), Tailwind 3.4, @midcine/ui with 17 components
- NEXUS-AI (46 agents) sits at D:\project\suportagent, exposes MCP server. Agent names include: vision_ai, clinical_llm, guardian, algorithm_expert, code_reviewer, architect, devops_master, etc.
- Deploy target: Tailscale Funnel at ame.tail19ddab.ts.net (already used for mobeface + smartfleet on ports 8443/8444)

PHILOSOPHY (6 principles, non-negotiable):
1. NEXUS-AI is the AI brain — mcp-bridge must be a thin bridge, no local model logic
2. Lightweight security that does not restrict creativity (no HSM, no internal mTLS, no blanket 2FA)
3. No imitation — Infisical>Vault, Compose>k8s, Coolify>custom CI
4. Ensemble at every layer
5. Inherited avoidance — adopt what big legacy avoids (WebSocket, FHIR JSON, WASM DICOM)
6. Web-first — one Next app w/ 7 routes, PWA before native

Reply in ENGLISH ONLY, in strict Markdown, no filler prose. Every code block must be complete, ready to paste.
'@

$userPrompt = @'
Deliver an implementation-ready plan and code for shipping midcine v3 to a **running local server exposed via Tailscale Funnel on port 8445** by end of day. Provide EXACTLY these sections in this order:

## 1. mcp-bridge — full implementation
Provide complete, runnable code for:
- `services/mcp-bridge/app/agents_client.py` — pybreaker-wrapped async MCP caller. Since we cannot literally embed the NEXUS MCP transport in this file, implement it as an HTTP JSON-RPC caller to `http://host.docker.internal:8600/mcp` (the NEXUS MCP HTTP shim we will run). Interface: `async call_agent(name, prompt) -> {ok, data, error, latency_ms}` with circuit breaker per-agent (fail_max=3, reset_timeout=30s).
- `services/mcp-bridge/app/dispatcher.py` — loads `config/dispatch_rules.yaml`, matches (modality, body_part) → agent list.
- `services/mcp-bridge/app/aggregator.py` — consensus + disagreement flags, adapted from `docs/reference/v12-extracts/aggregator_pattern.py`.
- `services/mcp-bridge/app/schemas.py` — pydantic v2 models: DispatchRequest, DispatchResponse, AgentOutput, AggregateRequest, AggregateResponse, Finding, Disagreement.
- `services/mcp-bridge/app/main.py` — FastAPI with 4 endpoints: GET /health, POST /dispatch, POST /aggregate, POST /pipeline (does dispatch → parallel calls → aggregate in one shot).

## 2. NEXUS MCP HTTP shim
Provide `D:\project\suportagent\core\mcp_http_shim.py` — a small FastAPI (port 8600) that exposes each agent as `POST /agent/{name}` accepting `{"prompt": str}` and returning `{"ok": bool, "data": str, "error": str|null}`. It should call the existing agent infra in `D:\project\suportagent\core\runner.py` (or `orchestrator.py` if easier). Provide startup command (`python -m uvicorn core.mcp_http_shim:app --port 8600`).

## 3. apps/web ↔ mcp-bridge wiring
Provide:
- `apps/web/lib/mcp.ts` — client for /pipeline endpoint.
- Update `apps/web/app/(shell)/reader/[studyId]/page.tsx` to call `/api/mcp/pipeline` and render real ensemble output (findings, disagreements, per-agent confidence) in place of the current stub cards. Provide the new page.tsx in full.
- `apps/web/app/api/mcp/pipeline/route.ts` — Next Route Handler that proxies to mcp-bridge on 8210.

## 4. docker-compose additions
Provide a `infra/docker/mcp-bridge.override.yml` that adds the mcp-bridge service (port 8210) to the existing dev stack. Use `extra_hosts: - "host.docker.internal:host-gateway"` for Linux compatibility.

## 5. Tailscale Funnel deploy
Give me the EXACT PowerShell commands to:
- Free port 8445
- Start `pnpm --filter @midcine/web build` then `pnpm --filter @midcine/web start -p 3000` in background
- Expose it at `https://ame.tail19ddab.ts.net:8445` via `tailscale funnel --bg --https=8445 --set-path=/ http://localhost:3000`
- Verify with a curl probe
Also produce `scripts/deploy-web.ps1` that does all the above idempotently.

## 6. Acceptance checks
A numbered list of ≤ 10 concrete verification commands that prove the system is live end-to-end. Each command must be exact (no placeholders).

## 7. Known risks + mitigations
Max 5 items. Concrete only.

Do not preface with intro text. Start with "## 1." immediately.
'@

# Escape both prompts to Python string literals
$sysPy  = $systemPrompt -replace '\\', '\\\\' -replace '"""', '\"\"\"'
$userPy = $userPrompt -replace '\\', '\\\\' -replace '"""', '\"\"\"'

$py = @"
import sys
sys.path.insert(0, r"$scripts")
from naraya_direct import ask
out = ask(
    prompt=r'''$userPy''',
    system_prompt=r'''$sysPy''',
    model='mistral-large',
    max_tokens=8000,
    temperature=0.25,
)
sys.stdout.buffer.write(out.encode('utf-8'))
"@

Write-Host "Calling Naraya (mistral-large, 8000 tokens)..." -ForegroundColor Cyan
# Write to temp file (avoids Windows cmd quote-stripping on `python -c`)
$tmpPy = Join-Path ([System.IO.Path]::GetTempPath()) ("naraya-architect-{0}.py" -f ([Guid]::NewGuid().ToString('N')))
Set-Content -Path $tmpPy -Value $py -Encoding utf8
try {
    $response = python $tmpPy
} finally {
    Remove-Item $tmpPy -ErrorAction SilentlyContinue
}
if ($LASTEXITCODE -ne 0) {
    Write-Error "Naraya call failed (exit $LASTEXITCODE)"
    exit 1
}
Set-Content -Path $outFile -Value $response -Encoding utf8
Write-Host "Saved: $outFile ($($response.Length) chars)" -ForegroundColor Green
Write-Host ""
$response.Substring(0, [Math]::Min(2000, $response.Length))
