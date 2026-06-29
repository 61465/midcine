FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic pydantic-settings \
        minio pydicom numpy httpx Pillow structlog \
        pylibjpeg pylibjpeg-libjpeg pylibjpeg-openjpeg python-gdcm
COPY services/vision-ai/app /app/app
EXPOSE 8600
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8600"]
