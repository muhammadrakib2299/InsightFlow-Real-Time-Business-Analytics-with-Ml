"""Anomaly detectors operating on a daily series.

Two methods, both rolling-window:

  * z-score over the previous N days (default 7). Sensitivity is a
    threshold on |z|; default 3 ≈ 99.7th percentile under Gaussian.
  * IQR over the previous N days (default 14). Sensitivity is the
    multiplier on the IQR (default 1.5 = Tukey fences).

Both detectors return the same shape (ds, value, expected, is_anomaly)
so the API + frontend can switch detector without reshaping the payload.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd


@dataclass(slots=True)
class AnomalyResult:
    ds: date
    value: float
    expected: float | None
    is_anomaly: bool


def zscore_detect(
    df: pd.DataFrame,
    *,
    window_days: int = 7,
    threshold: float = 3.0,
) -> list[AnomalyResult]:
    """Flag points whose rolling z-score exceeds the threshold.

    The rolling stats are *trailing* (`closed="left"`) so the point
    under test never appears in its own baseline. The first `window`
    points have no baseline → expected=None, is_anomaly=False.
    """
    if df.empty:
        return []
    values = df["y"].astype(float)
    roll = values.rolling(window=window_days, min_periods=window_days, closed="left")
    mean = roll.mean()
    std = roll.std(ddof=0)

    out: list[AnomalyResult] = []
    for ds, value, mu, sigma in zip(df["ds"], values, mean, std):
        ds_date = _to_date(ds)
        if np.isnan(mu) or np.isnan(sigma):
            out.append(AnomalyResult(ds=ds_date, value=float(value), expected=None, is_anomaly=False))
            continue
        if sigma == 0:
            # No variance in the window — only flag if the value also
            # differs (degenerate constant series with one spike).
            flagged = value != mu
            out.append(
                AnomalyResult(
                    ds=ds_date, value=float(value), expected=float(mu), is_anomaly=bool(flagged)
                )
            )
            continue
        z = (value - mu) / sigma
        out.append(
            AnomalyResult(
                ds=ds_date,
                value=float(value),
                expected=float(mu),
                is_anomaly=bool(abs(z) >= threshold),
            )
        )
    return out


def iqr_detect(
    df: pd.DataFrame,
    *,
    window_days: int = 14,
    multiplier: float = 1.5,
) -> list[AnomalyResult]:
    """Flag points outside [Q1 - k*IQR, Q3 + k*IQR] of the previous window."""
    if df.empty:
        return []
    values = df["y"].astype(float)
    out: list[AnomalyResult] = []
    for i, (ds, value) in enumerate(zip(df["ds"], values)):
        ds_date = _to_date(ds)
        if i < window_days:
            out.append(AnomalyResult(ds=ds_date, value=float(value), expected=None, is_anomaly=False))
            continue
        window = values.iloc[i - window_days : i].to_numpy()
        q1 = float(np.quantile(window, 0.25))
        q3 = float(np.quantile(window, 0.75))
        iqr = q3 - q1
        lower = q1 - multiplier * iqr
        upper = q3 + multiplier * iqr
        expected = float(np.median(window))
        flagged = value < lower or value > upper
        out.append(
            AnomalyResult(
                ds=ds_date,
                value=float(value),
                expected=expected,
                is_anomaly=bool(flagged),
            )
        )
    return out


def _to_date(value) -> date:  # type: ignore[no-untyped-def]
    if isinstance(value, date) and not isinstance(value, pd.Timestamp):
        return value
    return pd.to_datetime(value).date()
