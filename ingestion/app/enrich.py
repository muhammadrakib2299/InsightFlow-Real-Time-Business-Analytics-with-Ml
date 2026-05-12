"""Server-side enrichment: geo (IP → country / city) and UA (string → device).

Both lookups are optional and fail open — if the GeoIP DB is missing or the
UA parser bails, we simply skip enrichment rather than dropping the event.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import structlog

logger = structlog.get_logger(__name__)


# ---------- GeoIP ---------------------------------------------------------


@lru_cache(maxsize=1)
def _geoip_reader():  # type: ignore[no-untyped-def]
    path = os.environ.get("GEOIP_DB_PATH", "/data/GeoLite2-City.mmdb")
    if not Path(path).is_file():
        logger.info("enrich.geoip.disabled", reason="no_db", path=path)
        return None
    try:
        import geoip2.database

        return geoip2.database.Reader(path)
    except Exception as exc:  # pragma: no cover - depends on optional dep
        logger.warning("enrich.geoip.disabled", reason="open_failed", error=str(exc))
        return None


def geo_lookup(ip: str) -> tuple[str, str]:
    """Return (country_iso2, city). Empty strings on miss."""
    if not ip:
        return "", ""
    reader = _geoip_reader()
    if reader is None:
        return "", ""
    try:
        rec = reader.city(ip)
        return (rec.country.iso_code or "", rec.city.name or "")
    except Exception:
        return "", ""


# ---------- User-Agent ----------------------------------------------------


def ua_lookup(ua_string: str) -> tuple[str, str, str]:
    """Return (device_family, os_family, browser_family)."""
    if not ua_string:
        return "", "", ""
    try:
        from ua_parser import user_agent_parser

        parsed = user_agent_parser.Parse(ua_string)
        return (
            parsed.get("device", {}).get("family", "") or "",
            parsed.get("os", {}).get("family", "") or "",
            parsed.get("user_agent", {}).get("family", "") or "",
        )
    except Exception:
        return "", "", ""
