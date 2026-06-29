from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "tunnel-broker"
    service_port: int = 8280
    log_level: str = "info"
    log_format: str = "json"

    sentry_dsn: str = ""
    sentry_env: str = "development"

    consent_service_url: str = "http://consent:8270"
    step_ca_url: str = "http://step-ca:9000"
    cert_ttl_min: int = 5

    stun_server: str = "stun:stun.cloudflare.com:3478"


settings = Settings()
