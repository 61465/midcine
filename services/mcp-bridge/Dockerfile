FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.115" "uvicorn[standard]>=0.32" "httpx>=0.27" \
    "pybreaker>=1.2" "pyyaml>=6.0" "pydantic>=2.9" "structlog>=24.4"

COPY app ./app
COPY config ./config

EXPOSE 8200

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]
