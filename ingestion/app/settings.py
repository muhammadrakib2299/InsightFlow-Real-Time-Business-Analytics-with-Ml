"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # Process
    app_env: str = Field(default="development", alias="APP_ENV")
    log_level: str = Field(default="info", alias="LOG_LEVEL")
    port: int = Field(default=5000, alias="INGESTION_PORT")

    # Kafka / Redpanda
    kafka_bootstrap: str = Field(default="redpanda:9092", alias="KAFKA_BOOTSTRAP_SERVERS")
    kafka_topic_events_raw: str = Field(default="events.raw", alias="KAFKA_TOPIC_EVENTS_RAW")
    kafka_topic_events_tick: str = Field(default="events.tick", alias="KAFKA_TOPIC_EVENTS_TICK")
    kafka_consumer_group: str = Field(default="events.consumer", alias="KAFKA_CONSUMER_GROUP")

    # Redis (rate limit + tick pub)
    redis_url: str = Field(default="redis://redis:6379", alias="REDIS_URL")

    # ClickHouse (used by the consumer)
    clickhouse_host: str = Field(default="clickhouse", alias="CLICKHOUSE_HOST")
    clickhouse_http_port: int = Field(default=8123, alias="CLICKHOUSE_HTTP_PORT")
    clickhouse_user: str = Field(default="default", alias="CLICKHOUSE_USER")
    clickhouse_password: str = Field(default="", alias="CLICKHOUSE_PASSWORD")
    clickhouse_db: str = Field(default="insightflow", alias="CLICKHOUSE_DB")

    # Auth-side state (we read api_keys directly from Postgres so we don't
    # depend on the NestJS service being up to ingest events).
    postgres_dsn: str = Field(
        default="postgresql://insightflow:change_me@postgres:5432/insightflow",
        alias="DATABASE_URL",
    )

    # Rate limit
    rate_limit_rps: int = Field(default=1000, alias="INGESTION_RATE_LIMIT_RPS")
    rate_limit_burst: int = Field(default=5000, alias="INGESTION_RATE_LIMIT_BURST")

    # Enrichment
    geoip_db_path: str = Field(default="/data/GeoLite2-City.mmdb", alias="GEOIP_DB_PATH")


@lru_cache
def get_settings() -> Settings:
    return Settings()
