from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration for the AI Dispatcher service."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Service identity
    service_name: str = "ai-dispatcher"
    service_port: int = 8200
    log_level: str = "info"
    log_format: str = Field(default="json", description="json or text")

    # Observability
    sentry_dsn: str = ""
    sentry_env: str = "development"
    otel_endpoint: str = "http://tempo:4317"

    # Redis Streams
    redis_url: str = "redis://redis:6379/0"
    stream_in: str = "studies:new"
    stream_out: str = "ai:inference"
    consumer_group: str = "ai-dispatcher"

    # Specialist model endpoints
    torchxrayvision_url: str = "http://ai-worker:8000/triage"
    monai_brain_url: str = "http://ai-worker:8000/brain"
    segmentation_url: str = "http://ai-worker:8000/segment"
    vision_language_url: str = "http://vision-ai:8250/describe"
    clinical_llm_url: str = "http://llm-service:8300/v1/llm/draft"

    # Aggregator
    aggregator_url: str = "http://ai-aggregator:8210/v1/aggregate"

    # Parallelism + timeouts
    parallel_timeout_sec: float = 30.0
    priority_gpu_only: str = "P1"

    # Routing rules path
    routing_rules_path: str = "/app/config/dispatch_rules.yaml"


settings = Settings()
