FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY packages/shared-types/py /opt/midcine-types
COPY packages/dicom-utils /opt/midcine-dicom
COPY services/ai-worker /opt/svc

RUN pip install --no-cache-dir /opt/midcine-types /opt/midcine-dicom \
 && pip install --no-cache-dir --no-deps /opt/svc \
 && pip install --no-cache-dir pydantic pydantic-settings "sqlalchemy[asyncio]" \
        asyncpg redis minio httpx numpy pydicom highdicom dicom2nifti nibabel SimpleITK structlog \
        pylibjpeg pylibjpeg-libjpeg pylibjpeg-openjpeg python-gdcm

WORKDIR /opt/svc
CMD ["python", "-m", "app.worker"]
