#!/usr/bin/env bash
# midcine bootstrap — Linux/Mac
set -e

ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
    cp .env.example .env
    echo "نُسخ .env من .env.example — راجعه قبل المتابعة"
fi

COMPOSE_ARGS="-f infra/docker/docker-compose.dev.yml --env-file .env"
if [ "${1:-}" = "--with-llm" ]; then
    COMPOSE_ARGS="$COMPOSE_ARGS --profile llm-real"
fi

echo "→ بناء الـ images..."
docker compose $COMPOSE_ARGS build

echo "→ تشغيل الـ stack..."
docker compose $COMPOSE_ARGS up -d

echo "→ انتظار Postgres..."
for i in {1..30}; do
    if docker compose $COMPOSE_ARGS logs postgres 2>&1 | grep -q "database system is ready to accept connections"; then
        break
    fi
    sleep 2
done

echo "→ تشغيل seed..."
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install --quiet "psycopg[binary]" argon2-cffi cryptography
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_DB=midcine POSTGRES_USER=midcine_app POSTGRES_PASSWORD=changeme_dev_only python scripts/seed_db.py
deactivate

if [ "${1:-}" = "--with-llm" ]; then
    echo "→ سحب نموذج Ollama..."
    docker exec midcine-ollama ollama pull qwen2.5:3b-instruct-q4_K_M
fi

echo ""
echo "✅ midcine جاهز!"
echo "  Web:     http://localhost:3000  (demo@midcine.io / DemoMidcine!2026)"
echo "  API:     http://localhost:8100/docs"
echo "  FHIR:    http://localhost:8400/fhir/R4/DiagnosticReport"
echo "  Orthanc: http://localhost:8042"
echo "  MinIO:   http://localhost:9001"
echo "  Viewer:  http://localhost:3030"
