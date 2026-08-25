# midcine
> Zero-code radiology AI assistant that runs inside your hospital firewall — DICOM in, structured reports out.

## Who reads this?
Hospital IT administrators who need to deploy midcine in under 5 minutes on existing Docker infrastructure.

---

## TL;DR
1. Clone → `docker compose up -d` → paste your Naraya API key.
2. Verify with `curl http://localhost:8210/health` (FastAPI) and `curl http://localhost:3000` (Next.js UI).
3. Optional: enable PACS, Ollama fallback, or TotalSegmentator via `docker-compose.premium.yml`.

---

## Prerequisites
- Docker Engine ≥ 24.0 (v20.10+ minimum)
- Docker Compose ≥ 2.23 (v2.0+ minimum)
- Linux host (tested on Ubuntu 22.04 LTS)
- 8GB RAM minimum (16GB recommended for premium services)
- Outbound HTTPS (port 443) to Naraya free tier (`api.bynara.ai`)

---

## 3-step deploy

1. Clone the repo
```bash
git clone https://github.com/midcine/midcine.git && cd midcine
```

2. Set the required environment variable
```bash
echo "NARAYA_API_KEY=your_free_tier_key_here" > .env
```

3. Start the stack
```bash
docker compose up -d
```

---

## Verify

FastAPI (mcp-bridge) health check
```bash
curl -s http://localhost:8210/health | jq
# Expected: {"status":"ok","version":"0.4.2"}
```

Next.js UI
```bash
curl -s http://localhost:3000 | grep -q "midcine" && echo "UI up" || echo "UI down"
```

---

## Optional upgrades

Enable premium services by merging the premium compose file:
```bash
# Option 1: Override file
cp docker-compose.premium.yml docker-compose.override.yml
docker compose up -d

# Option 2: Direct compose
docker compose -f docker-compose.yml -f docker-compose.premium.yml up -d
```

| Service | Purpose | Env var needed |
|---|---|---|
| Orthanc PACS | Local DICOM store | None |
| Ollama fallback | Local LLM fallback | `OLLAMA_URL=http://host.docker.internal:11434` or `http://ollama:11434` |
| TotalSegmentator | Whole-body segmentation | None |
| backup-cron | Nightly backups | `BACKUP_S3_BUCKET=your-bucket` |

---

## Common issues

1. **Port 8210 already in use**
   → Stop conflicting service (`sudo lsof -i :8210`) or edit `docker-compose.yml` line 12 to expose a different port.

2. **NARAYA_API_KEY rejected**
   → Sign up for a free tier key at [https://bynara.ai](https://bynara.ai) and ensure the key is pasted without whitespace or quotes in `.env`.

3. **Next.js UI stuck on loading spinner**
   → Check FastAPI logs (`docker compose logs mcp-bridge`) for 502 errors; ensure `NARAYA_API_KEY` is set in `.env`.

4. **Ollama connection refused**
   → Ensure Ollama is running on host and `OLLAMA_URL` points to correct address.

---

## Next steps
- [User guide for radiologists](docs/user-guide.md)
- [Configure PACS connection](docs/pacs-setup.md)
- [Customize LLM prompts](docs/prompts.md)
- [API reference for integrators](docs/api.md)
- [Contributing & local development](CONTRIBUTING.md)