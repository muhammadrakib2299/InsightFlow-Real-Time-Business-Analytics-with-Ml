"""Forecast-quality helpers shared by Prophet and ARIMA runners."""

from __future__ import annotations

import numpy as np


def mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Mean Absolute Percentage Error (0–∞, lower is better).

    Skips points where actual is 0 to avoid divide-by-zero blowing up
    on a sparse series. If everything is zero we return NaN — callers
    should treat that as "model untrustworthy" rather than 0.
    """
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    if actual.shape != predicted.shape:
        raise ValueError(f"shape mismatch: {actual.shape} vs {predicted.shape}")
    mask = actual != 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])))


HOLDOUT_DAYS = 14


def split_holdout(values: np.ndarray, holdout: int = HOLDOUT_DAYS) -> tuple[np.ndarray, np.ndarray]:
    """Return (train, test). If the series is too short, test is empty."""
    if len(values) <= holdout + 7:
        return values, np.array([], dtype=values.dtype)
    return values[:-holdout], values[-holdout:]
