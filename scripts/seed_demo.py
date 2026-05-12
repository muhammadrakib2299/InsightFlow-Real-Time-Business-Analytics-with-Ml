#!/usr/bin/env python3
"""
Seed 90 days of synthetic SaaS events for a workspace.

Generates a realistic mix of signup, session, payment, and churn events
with weekly seasonality, a slight upward trend, and one deliberate
anomaly mid-window for the demo. Events are POSTed via the public
/v1/events endpoint so this also exercises the wire contract — no
back-doors into ClickHouse.

Usage:
    python scripts/seed_demo.py \\
        --endpoint http://localhost:5000 \\
        --api-key ifk_live_xxxxxxxxxxxxxxxxxx \\
        --days 90 \\
        --base-mrr-cents 1500000

If you need a fresh API key, hit POST /api/workspaces/:id/api-keys on
the NestJS service and pass the returned secret here.
"""

from __future__ import annotations

import argparse
import math
import random
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable
from uuid import uuid4

import httpx

COUNTRIES = ["US", "GB", "DE", "FR", "IN", "BR", "JP", "AU", "CA", "NL"]
DEVICES = ["desktop", "mobile", "tablet"]
PLANS = ["starter", "growth", "scale"]
PLAN_PRICE_CENTS = {"starter": 1900, "growth": 4900, "scale": 19900}
UTM_SOURCES = ["organic", "google_ads", "twitter", "blog", "referral", ""]
UTM_MEDIUMS = ["seo", "cpc", "social", "email", "direct", ""]


@dataclass
class Args:
    endpoint: str
    api_key: str
    days: int
    base_mrr_cents: int
    seed: int
    batch_size: int
    sleep_ms: int
    dry_run: bool


def parse_args() -> Args:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--endpoint", default="http://localhost:5000",
                   help="Ingestion service base URL (default: %(default)s)")
    p.add_argument("--api-key", required=True,
                   help="ifk_live_… key for the target workspace")
    p.add_argument("--days", type=int, default=90)
    p.add_argument("--base-mrr-cents", type=int, default=1_500_000,
                   help="Approximate starting MRR in cents (default: $15,000)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--batch-size", type=int, default=200)
    p.add_argument("--sleep-ms", type=int, default=50,
                   help="Pause between batches so we don't hit the rate limit")
    p.add_argument("--dry-run", action="store_true",
                   help="Generate events but don't POST anywhere")
    args = p.parse_args()
    return Args(
        endpoint=args.endpoint.rstrip("/"),
        api_key=args.api_key,
        days=args.days,
        base_mrr_cents=args.base_mrr_cents,
        seed=args.seed,
        batch_size=args.batch_size,
        sleep_ms=args.sleep_ms,
        dry_run=args.dry_run,
    )


def seasonality(day_idx: int, total_days: int) -> float:
    """Weekly cycle + slight upward trend + one anomaly drop near the
    middle of the window so the dashboard has something to find."""
    weekly = 1.0 + 0.10 * math.sin((day_idx % 7) * (2 * math.pi / 7))
    trend = 1.0 + 0.002 * day_idx
    # Anomaly: 50% drop on a single day near day total_days // 2
    anomaly_day = total_days // 2
    anomaly = 0.5 if day_idx == anomaly_day else 1.0
    return weekly * trend * anomaly


def maybe_event(prob: float, rng: random.Random) -> bool:
    return rng.random() < prob


def generate_events(args: Args) -> Iterable[dict]:
    rng = random.Random(args.seed)
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(days=args.days)

    user_pool: list[str] = []
    active_subscriptions: dict[str, tuple[str, int]] = {}  # user_id -> (plan, price_cents)

    avg_daily_signups = max(3, args.base_mrr_cents // 200_000)  # rough scale

    for day in range(args.days):
        day_start = start + timedelta(days=day)
        factor = seasonality(day, args.days)

        # Signups for the day
        target_signups = max(1, int(avg_daily_signups * factor * rng.uniform(0.7, 1.3)))
        for _ in range(target_signups):
            user_id = f"u_{uuid4().hex[:12]}"
            user_pool.append(user_id)
            ts = day_start + timedelta(seconds=rng.randint(0, 86_399))
            country = rng.choice(COUNTRIES)
            yield {
                "event_name": "signup",
                "user_id": user_id,
                "session_id": f"s_{uuid4().hex[:10]}",
                "occurred_at": ts.isoformat(),
                "country": country,
                "device": rng.choice(DEVICES),
                "utm_source": rng.choice(UTM_SOURCES),
                "utm_medium": rng.choice(UTM_MEDIUMS),
                "properties": {"source": rng.choice(["landing_page", "pricing", "blog"])},
            }

            # 70% of signups convert to a subscription within 24h
            if maybe_event(0.7, rng):
                plan = rng.choices(PLANS, weights=[6, 3, 1])[0]
                price = PLAN_PRICE_CENTS[plan]
                active_subscriptions[user_id] = (plan, price)
                conv_ts = ts + timedelta(minutes=rng.randint(5, 1440))
                yield {
                    "event_name": "subscription_started",
                    "user_id": user_id,
                    "session_id": f"s_{uuid4().hex[:10]}",
                    "occurred_at": conv_ts.isoformat(),
                    "revenue_cents": price,
                    "currency": "USD",
                    "country": country,
                    "properties": {"plan": plan},
                }

        # Sessions from active users (varies with seasonality)
        active_users = list(active_subscriptions.keys())
        target_sessions = int(len(active_users) * 0.5 * factor)
        for _ in range(target_sessions):
            if not active_users:
                break
            user_id = rng.choice(active_users)
            ts = day_start + timedelta(seconds=rng.randint(0, 86_399))
            yield {
                "event_name": "session_start",
                "user_id": user_id,
                "session_id": f"s_{uuid4().hex[:10]}",
                "occurred_at": ts.isoformat(),
                "device": rng.choice(DEVICES),
            }

        # Monthly payments (every 30 days a recurring charge per active sub)
        if day > 0 and day % 30 == 0:
            for user_id, (plan, price) in list(active_subscriptions.items()):
                ts = day_start + timedelta(seconds=rng.randint(0, 86_399))
                yield {
                    "event_name": "subscription_payment",
                    "user_id": user_id,
                    "session_id": "",
                    "occurred_at": ts.isoformat(),
                    "revenue_cents": price,
                    "currency": "USD",
                    "properties": {"plan": plan, "cycle": "monthly"},
                }

        # Churn — ~2% of active subs per day, doubled on the anomaly day
        churn_rate = 0.02 * (2.0 if day == args.days // 2 else 1.0)
        for user_id, (plan, _price) in list(active_subscriptions.items()):
            if maybe_event(churn_rate / 30, rng):  # spread across the month
                ts = day_start + timedelta(seconds=rng.randint(0, 86_399))
                yield {
                    "event_name": "subscription_cancelled",
                    "user_id": user_id,
                    "session_id": "",
                    "occurred_at": ts.isoformat(),
                    "properties": {"plan": plan, "reason": rng.choice(["too_expensive", "missing_feature", "no_longer_needed"])},
                }
                active_subscriptions.pop(user_id, None)


def batched(it: Iterable[dict], size: int) -> Iterable[list[dict]]:
    buf: list[dict] = []
    for x in it:
        buf.append(x)
        if len(buf) >= size:
            yield buf
            buf = []
    if buf:
        yield buf


def post_batch(client: httpx.Client, endpoint: str, api_key: str, events: list[dict]) -> None:
    body = events[0] if len(events) == 1 else {"events": events}
    resp = client.post(
        f"{endpoint}/v1/events",
        json=body,
        headers={"X-Api-Key": api_key},
        timeout=30.0,
    )
    if resp.status_code >= 400:
        raise SystemExit(f"ingest failed ({resp.status_code}): {resp.text[:200]}")


def main() -> int:
    args = parse_args()
    total = 0
    started = time.time()
    print(f"Generating {args.days} days of events… (seed={args.seed})")

    if args.dry_run:
        for batch in batched(generate_events(args), args.batch_size):
            total += len(batch)
        print(f"[dry-run] would post {total} events")
        return 0

    with httpx.Client(http2=False) as client:
        for batch in batched(generate_events(args), args.batch_size):
            post_batch(client, args.endpoint, args.api_key, batch)
            total += len(batch)
            if args.sleep_ms:
                time.sleep(args.sleep_ms / 1000)
    elapsed = time.time() - started
    print(f"Done — posted {total} events in {elapsed:.1f}s "
          f"({total / max(elapsed, 1e-3):.0f} ev/s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
