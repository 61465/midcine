FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV MIDCINE_STUDIES_DIR=/data/studies
ENV MWL_PORT=11115
ENV MWL_AET=MIDCINE-MWL
EXPOSE 11115
CMD ["python", "-m", "app.main"]
