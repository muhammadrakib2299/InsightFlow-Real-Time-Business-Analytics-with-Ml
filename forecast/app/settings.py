"""Runtime configuration for the forecast service."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")
    log_level: str = Field(default="info", alias="LOG_LEVEL")
    port: int = Field(default=8000, alias="FORECAST_PORT")

    artifacts_dir: str = Field(default="/app/artifacts", alias="FORECAST_ARTIFACTS_DIR")
    train_window_days: int = Field(default=540, alias="FORECAST_TRAIN_WINDOW_DAYS")
    cache_ttl_seconds: int = Field(default=86400, alias="FORECAST_CACHE_TTL_SECONDS")
    retrain_shared_secret: str = Field(default="change_me_retrain", alias="RETRAIN_SHARED_SECRET")

    clickhouse_host: str = Field(default="clickhouse", alias="CLICKHOUSE_HOST")
    clickhouse_http_port: int = Field(default=8123, alias="CLICKHOUSE_HTTP_PORT")
    clickhouse_user: str = Field(default="default", alias="CLICKHOUSE_USER")
    clickhouse_password: str = Field(default="", alias="CLICKHOUSE_PASSWORD")
    clickhouse_db: str = Field(default="insightflow", alias="CLICKHOUSE_DB")

    redis_url: str = Field(default="redis://redis:6379", alias="REDIS_URL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
