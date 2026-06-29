FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY packages/shared-types/py /opt/midcine-types
COPY packages/dicom-utils /opt/midcine-dicom
COPY services/ingestion-api /opt/svc

RUN pip install /opt/midcine-types /opt/midcine-dicom \
 && pip install --no-deps /opt/svc \
 && pip install fastapi "uvicorn[standard]" pydantic pydantic-settings \
        "sqlalchemy[asyncio]" asyncpg redis minio python-multipart httpx PyJWT argon2-cffi cryptography highdicom pydicom structlog

WORKDIR /opt/svc
EXPOSE 8100
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
