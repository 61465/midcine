FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY packages/shared-types/py /opt/midcine-types
COPY services/llm-service /opt/svc

RUN pip install --no-cache-dir /opt/midcine-types \
 && pip install --no-cache-dir --no-deps /opt/svc \
 && pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic pydantic-settings \
        "sqlalchemy[asyncio]" asyncpg redis httpx jinja2 structlog

WORKDIR /opt/svc
EXPOSE 8300
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8300 & python -m app.worker"]
