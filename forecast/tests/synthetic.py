"""Synthetic-series generator shared across forecast tests.

We use a stable RNG seed so MAPE thresholds in the tests are
reproducible — without a seed, occasional unlucky noise draws would
make CI flaky.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def make_seasonal_series(
    days: int = 120,
    *,
    base: float = 100.0,
    weekly_amp: float = 20.0,
    trend_per_day: float = 0.5,
    noise_sigma: float = 3.0,
    seed: int = 42,
    start: str = "2024-01-01",
) -> pd.DataFrame:
    """Daily series with weekly seasonality, slight upward trend, and
    Gaussian noise. Returns (ds, y) ready for Prophet."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start=start, periods=days, freq="D")
    t = np.arange(days)
    weekly = weekly_amp * np.sin(2 * np.pi * t / 7)
    trend = trend_per_day * t
    noise = rng.normal(0, noise_sigma, days)
    y = np.clip(base + trend + weekly + noise, 0, None)
    return pd.DataFrame({"ds": idx, "y": y})
