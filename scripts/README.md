# scripts

Operational scripts run outside the request path.

- `seed_demo.py` — generates 90 days of synthetic SaaS subscription events (signups, subscription_started, payment_succeeded, subscription_canceled, page_view). Posts via the public `POST /v1/events` API so the data contract is exercised end-to-end. Includes realistic weekly seasonality and one planted anomaly mid-window for the alert-detector demo.
- `load_gen.py` — k6 / locust load generator for the M6 load test (1k events/s sustained, 5k burst).
- `retrain_cron.sh` — local equivalent of the `.github/workflows/retrain.yml` cron; posts to `forecast:/retrain` with the shared secret. Useful for testing retrain on a dev box.
