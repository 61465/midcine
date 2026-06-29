from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "ingestion-api"
    log_level: str = "info"

    postgres_url: str = Field(
        default="postgresql+asyncpg://midcine_app:changeme_dev_only@postgres:5432/midcine"
    )

    redis_url: str = "redis://redis:6379/0"

    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "midcine-dev"
    minio_secret_key: str = "midcine-dev-secret-change-me"
    minio_bucket: str = "midcine-studies"
    minio_use_ssl: bool = False

    jwt_secret: str = "dev-only-32byte-secret-replace-me-please-1234567890"
    jwt_alg: str = "HS256"
    jwt_ttl_seconds: int = 900
    refresh_ttl_seconds: int = 604800

    field_encryption_key_b64: str = "ZGV2X29ubHlfMzJfYnl0ZV9rZXlfZm9yX21pZGNpbmU="
    field_hmac_key_b64: str = "ZGV2X29ubHlfMzJfYnl0ZV9obWFjX2tleV9mb3JfbWlk"

    midcine_dev_tenant_id: str = "11111111-1111-1111-1111-111111111111"


@lru_cache
def get_settings() -> Settings:
    return Settings()
