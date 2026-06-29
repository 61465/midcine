FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY services/fhir-gateway /opt/svc
RUN pip install --no-cache-dir --no-deps /opt/svc \
 && pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic pydantic-settings \
        "sqlalchemy[asyncio]" asyncpg "fhir.resources>=7.1" structlog

WORKDIR /opt/svc
EXPOSE 8400
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8400"]
