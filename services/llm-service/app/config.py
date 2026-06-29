from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "llm-service"
    postgres_url: str = "postgresql+asyncpg://midcine_app:changeme_dev_only@postgres:5432/midcine"
    redis_url: str = "redis://redis:6379/0"

    llm_backend: str = "stub"  # 'stub' أو 'ollama'
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:3b-instruct-q4_K_M"


@lru_cache
def get_settings() -> Settings:
    return Settings()
