FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
RUN uv pip install --system -r pyproject.toml
COPY app ./app
RUN useradd --create-home --uid 1001 midcine && chown -R midcine:midcine /app
USER midcine
EXPOSE 8270
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8270/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8270"]
