from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "cloud-index"
    service_port: int = 8260
    log_level: str = "info"
    log_format: str = "json"

    sentry_dsn: str = ""
    sentry_env: str = "development"

    # Postgres for PMI index table (hashes only, no PII)
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "midcine"
    postgres_user: str = "midcine_app"
    postgres_password: str = "changeme"

    # The salt is also held in each hospital's Infisical; lookup hashes
    # are computed by the hospital, not by this service.
    pmi_hash_salt: str = "rotate-per-deployment"


settings = Settings()
