from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "ai-worker"
    postgres_url: str = "postgresql+asyncpg://midcine_app:changeme_dev_only@postgres:5432/midcine"
    redis_url: str = "redis://redis:6379/0"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "midcine-dev"
    minio_secret_key: str = "midcine-dev-secret-change-me"
    minio_bucket: str = "midcine-studies"
    minio_use_ssl: bool = False

    ai_triage_threshold: float = 0.005  # نسبة الـ pixels في نطاق HU 60-90


@lru_cache
def get_settings() -> Settings:
    return Settings()
