from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "ai-aggregator"
    service_port: int = 8210
    log_level: str = "info"
    log_format: str = "json"

    sentry_dsn: str = ""
    sentry_env: str = "development"

    disagreement_threshold: float = 0.3
    high_confidence_threshold: float = 0.85


settings = Settings()
