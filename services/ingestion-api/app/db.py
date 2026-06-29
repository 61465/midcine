from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

from .config import get_settings

_settings = get_settings()

engine = create_async_engine(_settings.postgres_url, pool_size=10, max_overflow=20, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def tenant_session(tenant_id: str, role: str = "doctor") -> AsyncIterator[AsyncSession]:
    """يفتح session ويضبط متغيرات midcine.current_tenant + midcine.current_role لتفعيل RLS."""
    async with SessionLocal() as session:
        await session.execute(
            text("SELECT set_config('midcine.current_tenant', :v, true)"),
            {"v": str(tenant_id)},
        )
        await session.execute(
            text("SELECT set_config('midcine.current_role', :v, true)"),
            {"v": role},
        )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
