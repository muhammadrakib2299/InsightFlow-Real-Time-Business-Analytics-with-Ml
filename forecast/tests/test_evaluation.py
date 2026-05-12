"""Unit tests for the MAPE + holdout-split helpers."""

from __future__ import annotations

import numpy as np
import pytest

from app.services.evaluation import HOLDOUT_DAYS, mape, split_holdout


def test_mape_zero_when_perfect() -> None:
    actual = np.array([10.0, 20.0, 30.0])
    assert mape(actual, actual) == pytest.approx(0.0)


def test_mape_ignores_zero_actuals() -> None:
    actual = np.array([0.0, 10.0, 20.0])
    predicted = np.array([5.0, 10.0, 20.0])
    # The zero point would otherwise divide by zero; we drop it and
    # see two perfect matches → mape = 0.
    assert mape(actual, predicted) == pytest.approx(0.0)


def test_mape_nan_when_all_actuals_zero() -> None:
    actual = np.zeros(5)
    predicted = np.ones(5)
    assert np.isnan(mape(actual, predicted))


def test_mape_known_value() -> None:
    actual = np.array([100.0, 100.0])
    predicted = np.array([110.0, 90.0])
    # 10% off both directions → mean abs % error = 10%
    assert mape(actual, predicted) == pytest.approx(0.10)


def test_split_holdout_returns_empty_test_for_short_series() -> None:
    values = np.arange(HOLDOUT_DAYS + 1, dtype=float)
    train, test = split_holdout(values)
    # Series is too short → everything is train, test is empty
    assert len(train) == len(values)
    assert test.size == 0


def test_split_holdout_takes_last_n_for_long_series() -> None:
    values = np.arange(60, dtype=float)
    train, test = split_holdout(values)
    assert len(test) == HOLDOUT_DAYS
    assert len(train) == 60 - HOLDOUT_DAYS
    np.testing.assert_array_equal(test, values[-HOLDOUT_DAYS:])
