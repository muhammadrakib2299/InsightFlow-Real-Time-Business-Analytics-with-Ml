"""Unit tests for enrichment helpers."""

from __future__ import annotations

import os

from app import enrich


def test_geo_lookup_returns_empty_when_no_db(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("GEOIP_DB_PATH", "/definitely/does/not/exist.mmdb")
    enrich._geoip_reader.cache_clear()
    assert enrich.geo_lookup("8.8.8.8") == ("", "")


def test_geo_lookup_empty_ip() -> None:
    assert enrich.geo_lookup("") == ("", "")


def test_ua_lookup_empty_string() -> None:
    assert enrich.ua_lookup("") == ("", "", "")


def test_ua_lookup_parses_chrome() -> None:
    ua = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    device, os_, browser = enrich.ua_lookup(ua)
    assert browser == "Chrome"
    assert os_.startswith("Mac")
    # device on desktop is often "Other" — just assert we got something
    assert isinstance(device, str)
