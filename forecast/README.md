# forecast — FastAPI ML service

Python 3.11 service running Prophet (primary) and ARIMA (baseline + fallback) for 30 / 60 / 90-day KPI forecasts, plus Z-score and IQR anomaly detection.

**Endpoints**

- `POST /forecast` — `{workspace_id, metric, horizon_days}` returns `yhat`, `yhat_lower`, `yhat_upper`. Serves from Redis (24 h TTL), falls back to on-demand fit.
- `POST /retrain` — internal, shared-secret-protected. Refits every `(workspace_id, metric)` pair. Triggered by GitHub Actions cron at 02:00 UTC (`.github/workflows/retrain.yml`).
- `GET /models` — registry metadata: fitted_at, training_window, MAPE, model_kind.
- `POST /anomaly/evaluate` — runs Z-score + IQR on a metric over a rolling window.

**Layout**

- `app/main.py` — FastAPI app
- `app/routers/` — `forecast.py`, `anomaly.py`, `retrain.py`
- `app/services/`
  - `prophet_runner.py` — daily-aggregated series → Prophet fit + forecast
  - `arima_runner.py` — auto_arima via pmdarima
  - `anomaly.py` — Z-score (rolling 7d) + IQR (rolling 14d)
  - `registry.py` — joblib artifacts under `artifacts/<workspace_id>/<metric>/<timestamp>.pkl`, SHA-256 manifest to refuse tampered artifacts
- `app/schemas/` — pydantic models
- `tests/` — pytest with synthetic seasonal series; MAPE threshold assertions

Artifacts live in `forecast/artifacts/` (gitignored) — created at runtime.
