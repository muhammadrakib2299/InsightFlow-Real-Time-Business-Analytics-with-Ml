"""Prophet runner sanity tests on synthetic series.

These tests touch the actual cmdstan toolchain — keep them out of
fast pre-commit; CI runs them. They use a deterministic seed so the
MAPE threshold is stable across runs.
"""

from __future__ import annotations

import importlib.util

import numpy as np
import pandas as pd
import pytest

from app.services import prophet_runner

from .synthetic import make_seasonal_series

prophet_available = importlib.util.find_spec("prophet") is not None
pytestmark = pytest.mark.skipif(not prophet_available, reason="prophet not installed")


def test_fit_on_clean_series_mape_under_threshold() -> None:
    df = make_seasonal_series(days=120, noise_sigma=3.0, seed=42)
    model, holdout_mape = prophet_runner.fit_on_series_for_test(df)
    assert model is not None
    assert holdout_mape is not None
    # Clean weekly-seasonal series with mild noise — Prophet should
    # comfortably stay under 8% MAPE on the 14-day holdout.
    assert holdout_mape < 0.08, f"unexpectedly high MAPE: {holdout_mape:.4f}"


def test_forecast_band_shape() -> None:
    df = make_seasonal_series(days=120, seed=42)
    model, _ = prophet_runner.fit_on_series_for_test(df)
    band = prophet_runner.forecast_from_artifact(model, history=df, horizon_days=30)

    # 30-day forecast horizon
    assert len(band.forecast) == 30
    # Required columns
    for col in ("ds", "yhat", "yhat_lower", "yhat_upper"):
        assert col in band.forecast.columns
    # Bands bracket the point estimate
    assert (band.forecast["yhat_upper"] >= band.forecast["yhat"]).all()
    assert (band.forecast["yhat"] >= band.forecast["yhat_lower"]).all()
    # Clipped at zero
    assert (band.forecast["yhat_lower"] >= 0).all()
    # History passes through unchanged
    pd.testing.assert_frame_equal(band.history.reset_index(drop=True), df.reset_index(drop=True))


def test_fit_on_short_series_raises() -> None:
    df = make_seasonal_series(days=10)  # under MIN_TRAINING_ROWS
    with pytest.raises(ValueError):
        prophet_runner.fit_on_series_for_test(df)
