"""Unit tests for the Pydantic schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import BatchIn, EventIn


def test_event_in_minimal_payload() -> None:
    evt = EventIn(event_name="signup")
    assert evt.event_name == "signup"
    assert evt.revenue_cents == 0
    assert evt.properties == {}


def test_event_in_rejects_nested_properties() -> None:
    with pytest.raises(ValidationError, match="flat"):
        EventIn(event_name="purchase", properties={"items": [{"sku": "A"}]})


def test_event_in_stringifies_property_values() -> None:
    evt = EventIn(event_name="page_view", properties={"plan": 9, "trial": True, "ref": None})
    assert evt.properties == {"plan": "9", "trial": "True", "ref": ""}


def test_event_in_rejects_unknown_top_level_fields() -> None:
    with pytest.raises(ValidationError):
        EventIn(event_name="signup", surprise="boom")  # type: ignore[call-arg]


def test_event_in_revenue_must_be_non_negative() -> None:
    with pytest.raises(ValidationError):
        EventIn(event_name="refund", revenue_cents=-100)


def test_batch_in_enforces_size() -> None:
    with pytest.raises(ValidationError):
        BatchIn(events=[])
    with pytest.raises(ValidationError):
        BatchIn(events=[EventIn(event_name="x") for _ in range(501)])


def test_batch_in_accepts_within_limit() -> None:
    batch = BatchIn(events=[EventIn(event_name="x") for _ in range(10)])
    assert len(batch.events) == 10
