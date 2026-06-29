FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir pynetdicom pydicom httpx redis structlog
COPY services/dicom-receiver/app /app/app
EXPOSE 11113
CMD ["python", "-m", "app.receiver"]
