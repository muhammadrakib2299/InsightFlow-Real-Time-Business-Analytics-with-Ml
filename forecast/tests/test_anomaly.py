"""Tests for the rolling z-score and IQR anomaly detectors."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services.anomaly import iqr_detect, zscore_detect

from .synthetic import make_seasonal_series


def _plant_spike(df: pd.DataFrame, index: int, magnitude: float) -> pd.DataFrame:
    df = df.copy()
    df.loc[index, "y"] = df.loc[index, "y"] + magnitude
    return df


def test_zscore_warmup_returns_false() -> None:
    df = make_seasonal_series(days=30, seed=1)
    results = zscore_detect(df, window_days=7, threshold=3.0)
    # The first 7 days have an incomplete trailing window → no flags
    for r in results[:7]:
        assert r.is_anomaly is False
        assert r.expected is None


def test_zscore_catches_planted_spike() -> None:
    df = make_seasonal_series(days=90, noise_sigma=2.0, seed=1)
    spike_idx = 60
    df = _plant_spike(df, spike_idx, magnitude=80.0)
    results = zscore_detect(df, window_days=7, threshold=3.0)
    flagged = [r for r in results if r.is_anomaly]
    assert len(flagged) >= 1
    # The spike day specifically should be flagged
    assert results[spike_idx].is_anomaly is True


def test_zscore_quiet_series_yields_no_flags() -> None:
    # Constant series with imperceptible noise — should produce zero
    # anomalies (the detector only flags when |z| >= threshold).
    rng = np.random.default_rng(0)
    df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-01", periods=30, freq="D"),
            "y": 100.0 + rng.normal(0, 0.01, 30),
        }
    )
    results = zscore_detect(df, window_days=7, threshold=3.0)
    flagged_after_warmup = [r for r in results[7:] if r.is_anomaly]
    assert len(flagged_after_warmup) == 0


def test_iqr_catches_planted_spike() -> None:
    df = make_seasonal_series(days=90, noise_sigma=2.0, seed=1)
    spike_idx = 50
    df = _plant_spike(df, spike_idx, magnitude=60.0)
    results = iqr_detect(df, window_days=14, multiplier=1.5)
    assert results[spike_idx].is_anomaly is True


def test_iqr_expected_is_median() -> None:
    df = make_seasonal_series(days=60, noise_sigma=2.0, seed=1)
    results = iqr_detect(df, window_days=14, multiplier=1.5)
    # After the warmup, expected must equal the rolling median of the
    # previous 14 points.
    sample_idx = 30
    expected = float(np.median(df["y"].iloc[sample_idx - 14 : sample_idx]))
    assert results[sample_idx].expected == pytest.approx(expected)
