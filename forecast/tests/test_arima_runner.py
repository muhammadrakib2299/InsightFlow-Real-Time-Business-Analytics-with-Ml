"""ARIMA runner sanity tests on synthetic series.

ARIMA gets a looser MAPE threshold than Prophet because it has weaker
support for weekly seasonality on small windows — that's by design,
ARIMA is the baseline.
"""

from __future__ import annotations

import importlib.util

import pytest

from app.services import arima_runner

from .synthetic import make_seasonal_series

pmdarima_available = importlib.util.find_spec("pmdarima") is not None
pytestmark = pytest.mark.skipif(not pmdarima_available, reason="pmdarima not installed")


def test_fit_on_clean_series_mape_reasonable() -> None:
    df = make_seasonal_series(days=120, noise_sigma=3.0, seed=42)
    artifact, holdout_mape = arima_runner.fit_on_series_for_test(df)
    assert artifact is not None
    assert holdout_mape is not None
    # 15% is generous — ARIMA without external seasonality often lands
    # around 8-12% on this synthetic series. We want the test to fail
    # only when something is materially broken.
    assert holdout_mape < 0.15, f"unexpectedly high ARIMA MAPE: {holdout_mape:.4f}"


def test_forecast_band_shape() -> None:
    df = make_seasonal_series(days=120, seed=42)
    artifact, _ = arima_runner.fit_on_series_for_test(df)
    out = arima_runner.forecast_from_artifact(artifact, horizon_days=30)
    forecast = out["forecast"]
    assert len(forecast) == 30
    for col in ("ds", "yhat", "yhat_lower", "yhat_upper"):
        assert col in forecast.columns
    assert (forecast["yhat_upper"] >= forecast["yhat"]).all()
    assert (forecast["yhat"] >= forecast["yhat_lower"]).all()
    assert (forecast["yhat_lower"] >= 0).all()
    assert out["model_kind"] == "arima"


def test_fit_on_short_series_raises() -> None:
    df = make_seasonal_series(days=10)
    with pytest.raises(ValueError):
        arima_runner.fit_on_series_for_test(df)
