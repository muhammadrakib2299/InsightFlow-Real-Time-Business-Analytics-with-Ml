"""ARIMA model runner — baseline + fallback.

Two reasons to ship this alongside Prophet (see ADR-003):
  (a) Baseline accuracy comparison shown in the model card.
  (b) Fallback when Prophet fails on extremely sparse series.

Same horizon contract as Prophet so the registry + endpoint don't care
which model is loaded. We persist a small wrapper dataclass rather than
the raw pmdarima fitted model so the manifest schema is stable across
library upgrades.
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
class ArimaArtifact:
    """Wrapper persisted to disk. Re-loading reconstructs the fit lazily
    from the order + seasonal_order + training history, which is more
    forward-compatible than pickling pmdarima internals."""

    order: tuple[int, int, int]
    seasonal_order: tuple[int, int, int, int]
    history: pd.DataFrame  # ds, y
    last_index: pd.Timestamp
    interval_width: float


def _fit_pmdarima(values: np.ndarray):  # type: ignore[no-untyped-def]
    import pmdarima as pm

    model = pm.auto_arima(
        values,
        seasonal=True,
        m=7,  # weekly seasonality on daily data
        suppress_warnings=True,
        error_action="ignore",
        stepwise=True,
        max_p=5,
        max_q=5,
        max_P=2,
        max_Q=2,
        max_d=2,
        max_D=1,
    )
    return model


def fit_and_persist(
    workspace_id: str,
    metric_name: str,
    *,
    training_window_days: int | None = None,
) -> ArtifactRef:
    metric_def = resolve(metric_name)
    series: DailySeries = fetch_daily(
        workspace_id, metric_name, metric_def, train_window_days=training_window_days
    )
    df = series.df
    if len(df) < MIN_TRAINING_ROWS:
        raise RuntimeError(
            f"too few daily rows for {metric_name} on {workspace_id}: "
            f"{len(df)} (min {MIN_TRAINING_ROWS})"
        )

    holdout = HOLDOUT_DAYS if len(df) > HOLDOUT_DAYS + 7 else 0
    train_values = df["y"].to_numpy()[:-holdout] if holdout else df["y"].to_numpy()
    model = _fit_pmdarima(train_values)

    holdout_mape: float | None = None
    if holdout:
        forecast = model.predict(n_periods=holdout)
        holdout_mape = mape(df["y"].to_numpy()[-holdout:], np.asarray(forecast))
        # Refit on the full series for the persisted model
        model = _fit_pmdarima(df["y"].to_numpy())

    artifact = ArimaArtifact(
        order=tuple(model.order),
        seasonal_order=tuple(getattr(model, "seasonal_order", (0, 0, 0, 0))),
        history=df.copy(),
        last_index=df["ds"].iloc[-1],
        interval_width=0.80,
    )
    fitted_at = datetime.now(timezone.utc).isoformat()
    ref = save(
        workspace_id=workspace_id,
        metric=metric_name,
        model_kind="arima",
        model=artifact,
        training_window_days=training_window_days or 540,
        mape=holdout_mape,
        extras={
            "n_rows": int(len(df)),
            "order": list(artifact.order),
            "seasonal_order": list(artifact.seasonal_order),
            "earliest": str(series.earliest),
            "latest": str(series.latest),
            "holdout_days": holdout,
        },
    )
    logger.info(
        "arima.fit_and_persist.done",
        workspace_id=workspace_id,
        metric=metric_name,
        rows=len(df),
        mape=holdout_mape,
        order=artifact.order,
        seasonal_order=artifact.seasonal_order,
        fitted_at=fitted_at,
    )
    return ref


def forecast_from_artifact(artifact: ArimaArtifact, *, horizon_days: int) -> dict[str, Any]:
    """Re-fit a fresh ARIMA with the persisted (order, seasonal_order) on
    the artifact's history, then predict horizon_days ahead. We refit
    rather than pickle the fitted model because pmdarima internals change
    across versions; the order + history are stable inputs.
    """
    import pmdarima as pm
    from scipy.stats import norm

    values = artifact.history["y"].to_numpy()
    model = pm.ARIMA(order=artifact.order, seasonal_order=artifact.seasonal_order)
    model.fit(values)

    yhat, conf_int = model.predict(n_periods=horizon_days, return_conf_int=True, alpha=1 - artifact.interval_width)
    # pmdarima's conf_int is (n_periods, 2) — order [lower, upper]
    yhat_lower = conf_int[:, 0]
    yhat_upper = conf_int[:, 1]

    future_dates = pd.date_range(
        start=artifact.last_index + pd.Timedelta(days=1),
        periods=horizon_days,
        freq="D",
    )
    forecast = pd.DataFrame(
        {
            "ds": future_dates,
            "yhat": np.clip(yhat, 0, None),
            "yhat_lower": np.clip(yhat_lower, 0, None),
            "yhat_upper": np.clip(yhat_upper, 0, None),
        }
    )
    return {
        "history": artifact.history,
        "forecast": forecast,
        "model_kind": "arima",
    }


def fit_on_series_for_test(df: pd.DataFrame) -> tuple[ArimaArtifact, float | None]:
    """Test-only helper that bypasses ClickHouse."""
    if len(df) < MIN_TRAINING_ROWS:
        raise ValueError("series too short")
    holdout = HOLDOUT_DAYS if len(df) > HOLDOUT_DAYS + 7 else 0
    train_values = df["y"].to_numpy()[:-holdout] if holdout else df["y"].to_numpy()
    model = _fit_pmdarima(train_values)
    holdout_mape = None
    if holdout:
        forecast = model.predict(n_periods=holdout)
        holdout_mape = mape(df["y"].to_numpy()[-holdout:], np.asarray(forecast))
    artifact = ArimaArtifact(
        order=tuple(model.order),
        seasonal_order=tuple(getattr(model, "seasonal_order", (0, 0, 0, 0))),
        history=df.copy(),
        last_index=df["ds"].iloc[-1],
        interval_width=0.80,
    )
    return artifact, holdout_mape
