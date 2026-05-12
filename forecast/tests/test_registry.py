"""Tests for the filesystem-backed model registry."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import registry
from app.settings import get_settings


@pytest.fixture(autouse=True)
def _isolate_artifacts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FORECAST_ARTIFACTS_DIR", str(tmp_path))
    get_settings.cache_clear()  # type: ignore[attr-defined]


def test_save_and_latest_roundtrip() -> None:
    model = {"theta": [1, 2, 3]}
    ref = registry.save(
        workspace_id="11111111-1111-1111-1111-111111111111",
        metric="mrr",
        model_kind="prophet",
        model=model,
        training_window_days=540,
        mape=0.07,
    )
    assert ref.artifact_path.exists()
    assert ref.manifest_path.exists()

    latest = registry.latest("11111111-1111-1111-1111-111111111111", "mrr")
    assert latest is not None
    assert latest.model_kind == "prophet"
    assert latest.mape == pytest.approx(0.07)

    loaded = registry.load(latest)
    assert loaded == model


def test_load_rejects_tampered_artifact() -> None:
    ref = registry.save(
        workspace_id="22222222-2222-2222-2222-222222222222",
        metric="dau",
        model_kind="arima",
        model={"x": 1},
        training_window_days=180,
    )
    with ref.artifact_path.open("ab") as f:
        f.write(b"BAD")
    with pytest.raises(RuntimeError, match="tampered"):
        registry.load(ref)


def test_list_models_returns_all() -> None:
    registry.save("w1", "mrr", "prophet", {"a": 1}, 540)
    registry.save("w1", "dau", "arima", {"b": 2}, 540)
    registry.save("w2", "mrr", "prophet", {"c": 3}, 540)
    refs = registry.list_models()
    metrics = sorted((r.workspace_id, r.metric, r.model_kind) for r in refs)
    assert ("w1", "dau", "arima") in metrics
    assert ("w1", "mrr", "prophet") in metrics
    assert ("w2", "mrr", "prophet") in metrics
