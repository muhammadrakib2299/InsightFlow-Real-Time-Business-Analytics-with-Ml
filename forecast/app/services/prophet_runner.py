"""Prophet model runner.

Two responsibilities:

1. ``fit_and_persist`` — fetch a daily series from ClickHouse, fit
   Prophet with a 14-day holdout for MAPE, persist the fitted model
   via the registry along with metadata.
2. ``forecast_from_artifact`` — load the persisted artifact and produce
   a forecast band over a given horizon. This is the cheap path the
   /forecast endpoint exercises on every call.

Prophet is wrapped in a small class so the ARIMA runner can expose the
same contract (see arima_runner.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import structlog

from .evaluation import HOLDOUT_DAYS, mape
from .metrics import resolve
from .registry import ArtifactRef, save
from .series import DailySeries, fetch_daily

logger = structlog.get_logger(__name__)

MIN_TRAINING_ROWS = 21


@dataclass(slots=True)
class ForecastBand:
    history: pd.DataFrame  # ds, y
    forecast: pd.DataFrame  # ds, yhat, yhat_lower, yhat_upper
    mape: float | None
    model_kind: str
    fitted_at: str


def _build_model() -> Any:
    # Imported lazily so tests that don't touch fitting can run without
    # the cmdstan compile penalty.
    from prophet import Prophet

    return Prophet(
        weekly_seasonality=True,
        yearly_seasonality="auto",
        daily_seasonality=False,
        interval_width=0.80,
        changepoint_prior_scale=0.05,
    )


def _suppress_stan_logging() -> None:
    import logging as _logging

    for name in ("cmdstanpy", "prophet.plot", "prophet"):
        _logging.getLogger(name).setLevel(_logging.WARNING)


def fit_and_persist(
    workspace_id: str,
    metric_name: str,
    *,
    training_window_days: int | None = None,
) -> ArtifactRef:
    """Fit Prophet on the freshest series and persist the fitted model."""
    _suppress_stan_logging()
    metric_def = resolve(metric_name)
    series: DailySeries = fetch_daily(
        workspace_id, metric_name, metric_def, train_window_days=training_window_days
    )
    df = series.df.rename(columns={"ds": "ds", "y": "y"})
    if len(df) < MIN_TRAINING_ROWS:
        raise RuntimeError(
            f"too few daily rows for {metric_name} on {workspace_id}: "
            f"{len(df)} (min {MIN_TRAINING_ROWS})"
        )

    holdout = HOLDOUT_DAYS if len(df) > HOLDOUT_DAYS + 7 else 0
    train_df = df.iloc[:-holdout] if holdout else df
    test_df = df.iloc[-holdout:] if holdout else pd.DataFrame(columns=df.columns)

    model = _build_model()
    model.fit(train_df)

    holdout_mape: float | None = None
    if not test_df.empty:
        future = test_df[["ds"]].copy()
        pred = model.predict(future)
        holdout_mape = mape(test_df["y"].to_numpy(), pred["yhat"].to_numpy())

    # Refit on the full series so the persisted model uses every point —
    # but only if there was a holdout split (otherwise this is a no-op).
    if holdout:
        model = _build_model()
        model.fit(df)

    fitted_at = datetime.now(timezone.utc).isoformat()
    ref = save(
        workspace_id=workspace_id,
        metric=metric_name,
        model_kind="prophet",
        model=model,
        training_window_days=training_window_days or 540,
        mape=holdout_mape,
        extras={
            "n_rows": int(len(df)),
            "earliest": str(series.earliest),
            "latest": str(series.latest),
            "holdout_days": holdout,
        },
    )
    logger.info(
        "prophet.fit_and_persist.done",
        workspace_id=workspace_id,
        metric=metric_name,
        rows=len(df),
        mape=holdout_mape,
        fitted_at=fitted_at,
    )
    return ref


def forecast_from_artifact(
    model: Any,
    *,
    history: pd.DataFrame,
    horizon_days: int,
) -> ForecastBand:
    """Produce a forecast band from a previously fitted model."""
    future = model.make_future_dataframe(periods=horizon_days, freq="D", include_history=False)
    raw = model.predict(future)
    forecast = raw[["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
    forecast["yhat"] = forecast["yhat"].clip(lower=0)
    forecast["yhat_lower"] = forecast["yhat_lower"].clip(lower=0)
    return ForecastBand(
        history=history,
        forecast=forecast,
        mape=None,
        model_kind="prophet",
        fitted_at=datetime.now(timezone.utc).isoformat(),
    )


def fit_on_series_for_test(df: pd.DataFrame) -> tuple[Any, float | None]:
    """Test-only helper: fit on a caller-supplied series and return the
    fitted model + holdout MAPE. Bypasses ClickHouse so tests can use a
    synthetic series."""
    _suppress_stan_logging()
    if len(df) < MIN_TRAINING_ROWS:
        raise ValueError("series too short")
    holdout = HOLDOUT_DAYS if len(df) > HOLDOUT_DAYS + 7 else 0
    train_df = df.iloc[:-holdout] if holdout else df
    test_df = df.iloc[-holdout:] if holdout else pd.DataFrame(columns=df.columns)
    model = _build_model()
    model.fit(train_df)
    holdout_mape = None
    if not test_df.empty:
        pred = model.predict(test_df[["ds"]])
        holdout_mape = mape(test_df["y"].to_numpy(), pred["yhat"].to_numpy())
    if holdout:
        model = _build_model()
        model.fit(df)
    return model, holdout_mape
