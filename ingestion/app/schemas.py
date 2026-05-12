"""Pydantic schemas for the ingestion API."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EventIn(BaseModel):
    """A single event posted by a client SDK or webhook."""

    model_config = ConfigDict(extra="forbid")

    event_id: UUID = Field(default_factory=uuid4)
    event_name: str = Field(min_length=1, max_length=128)
    user_id: str = Field(default="", max_length=256)
    session_id: str = Field(default="", max_length=128)
    occurred_at: datetime | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    revenue_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="", max_length=8)

    # Optional client-provided enrichments (overridden by server-side
    # enrichment if the server can resolve them).
    country: str = Field(default="", max_length=2)
    city: str = Field(default="", max_length=128)
    device: str = Field(default="", max_length=64)
    os: str = Field(default="", max_length=64)
    browser: str = Field(default="", max_length=64)
    utm_source: str = Field(default="", max_length=128)
    utm_medium: str = Field(default="", max_length=128)
    utm_campaign: str = Field(default="", max_length=128)
    utm_term: str = Field(default="", max_length=128)
    utm_content: str = Field(default="", max_length=128)

    @field_validator("properties")
    @classmethod
    def _properties_are_flat(cls, v: dict[str, Any]) -> dict[str, Any]:
        # ClickHouse Map(String, String) — stringify primitives, reject nested
        # dicts (clients should hoist nested keys to dot notation).
        if any(isinstance(val, (dict, list)) for val in v.values()):
            raise ValueError("properties must be flat (no nested objects/arrays)")
        return {str(k): "" if val is None else str(val) for k, val in v.items()}


class BatchIn(BaseModel):
    """Batch of events. Limit chosen to keep one HTTP request under ~1 MB."""

    model_config = ConfigDict(extra="forbid")

    events: list[EventIn] = Field(min_length=1, max_length=500)


class IngestAck(BaseModel):
    accepted: int
    workspace_id: UUID
    queued_to: str  # kafka topic name
