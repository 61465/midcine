FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt || true
COPY app ./app
ENV MIDCINE_STUDIES_DIR=/data/studies
ENV HL7_PORT=2575
EXPOSE 2575
CMD ["python", "-m", "app.main"]
