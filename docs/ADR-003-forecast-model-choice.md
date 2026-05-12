# ADR-003 — Prophet primary, ARIMA baseline

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** Md. Rakib
- **Supersedes:** —
- **Superseded by:** —

## Context

Every KPI tile in InsightFlow ships with a 30 / 60 / 90-day forecast and a confidence interval rendered as a shaded band. The forecast is nightly-retrained per `(workspace_id, metric)` pair and cached in Redis for 24 hours.

Constraints:

- **Calibrated uncertainty.** Point forecasts aren't enough — the band is the whole point of the widget.
- **Robust to messy SaaS data.** Some metrics will have missing days, holidays, occasional outliers from one-off promos.
- **Fast retrain.** Nightly cron at 02:00 UTC must finish for hundreds of `(workspace, metric)` pairs on a single VPS. Target: a single fit in under 2 seconds on 18 months of daily data.
- **Inspectable.** A reviewer (or admissions committee) reading the repo should be able to see the model code and understand it, not just see a wrapper around a magic library.

Candidates considered: **Prophet**, **statsmodels ARIMA / SARIMAX** (with `pmdarima.auto_arima` for order selection), **NeuralProphet**, **GluonTS / DeepAR**.

## Decision

- **Prophet** as the primary forecaster.
- **ARIMA** (via `pmdarima.auto_arima`) as a baseline shown side-by-side on a model-card page, AND as a fallback when Prophet fails on extremely sparse series.

NeuralProphet, LSTM, and transformer-based forecasters are explicitly out of scope for v1 — they're in the v2 parking lot in `todo.md`.

## Why

- **Prophet handles multi-seasonality + holidays out of the box.** Weekly + yearly seasonality is exactly what SaaS metrics need. ARIMA can model it via SARIMA(X) but at the cost of fragile order tuning.
- **Calibrated `yhat_lower` / `yhat_upper`.** Prophet returns interval estimates by default — we render them as the shaded band without extra plumbing.
- **Fast on daily-aggregated data.** Pre-aggregating to daily before fitting (we never fit at event granularity) keeps Prophet fits well under a second per series in benchmarks.
- **ARIMA as a baseline is a credibility signal.** The model-card view shows Prophet MAPE vs ARIMA MAPE on the last-14-day holdout, demonstrating that Prophet is genuinely helping rather than just being on-trend.
- **Two models with the same horizon contract** means we can fall back automatically: if Prophet raises on a near-empty series (`< 14 daily points`), we silently swap to ARIMA and tag the result in the model registry.

## Trade-offs

- **Prophet is somewhat deprecated by Meta** (no major release since 2022). Acceptable — it still works, it's stable, and the alternative for v1 is to write our own seasonal-decomposition wrapper, which is not a good use of build time.
- **No fancy ML on the CV.** That's a feature, not a bug — a portfolio piece that ships forecasting that *actually works on a $5 VPS* is more impressive than one that runs a transformer nobody can deploy.

## Consequences

- `forecast/app/services/prophet_runner.py` and `arima_runner.py` share a `BaseForecaster` interface (`.fit(series, params) -> ModelHandle`, `.predict(handle, horizon_days) -> ForecastBand`) so the registry can serve them interchangeably.
- Model artifacts are joblib pickles in `forecast/artifacts/<workspace_id>/<metric>/<timestamp>.pkl` with a SHA-256 manifest in the registry — refuse to load tampered artifacts.
- Holiday calendars are per-workspace config (default: country inferred from the first user's IP) — added in M3.
