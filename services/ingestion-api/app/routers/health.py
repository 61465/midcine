from fastapi import APIRouter

from ..db import engine

router = APIRouter()


@router.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "ingestion-api"}


@router.get("/readyz")
async def readyz():
    try:
        async with engine.connect() as c:
            await c.execute(__import__("sqlalchemy").text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        return {"status": "not_ready", "error": str(e)}
