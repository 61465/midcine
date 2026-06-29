from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .realtime import router as realtime_router
from .routers.auth import router as auth_router
from .routers.health import router as health_router
from .routers.instances import router as instances_router
from .routers.patient import router as patient_router
from .routers.public import router as public_router
from .routers.reading import router as reading_router
from .storage import ensure_bucket

settings = get_settings()

logging.basicConfig(level=settings.log_level.upper())

app = FastAPI(title="midcine ingestion-api", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(instances_router)
app.include_router(reading_router)
app.include_router(patient_router)
app.include_router(public_router)
app.include_router(realtime_router)


@app.on_event("startup")
async def on_startup():
    ensure_bucket(settings.minio_bucket)
    ensure_bucket("midcine-heatmaps")
    ensure_bucket("midcine-reports")
    ensure_bucket("midcine-attachments")
