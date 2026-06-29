from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "consent"
    service_port: int = 8270
    log_level: str = "info"
    log_format: str = "json"

    sentry_dsn: str = ""
    sentry_env: str = "development"

    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "midcine"
    postgres_user: str = "midcine_app"
    postgres_password: str = "changeme"

    redis_url: str = "redis://redis:6379/0"

    whatsapp_bridge_url: str = "http://whatsapp-bridge:8500"
    sms_provider_url: str = ""  # configured per region

    consent_ttl_hours: int = 72
    otp_length: int = 6


settings = Settings()
