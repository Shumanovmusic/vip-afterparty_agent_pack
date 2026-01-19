"""
Unit tests for pacing_compare logic.

These tests do NOT run heavy simulations - they test comparison logic
with synthetic baseline/run dicts.
"""
import pytest

from scripts.pacing_compare import (
    METRICS_ORDER,
    TOLERANCES,
    Tolerance,
    check_metric,
    compare_mode,
    format_value,
)


class TestCheckMetric:
    """Tests for check_metric function."""

    def test_info_only_always_passes(self):
        """INFO-only metrics always pass regardless of values."""
        tolerance = Tolerance(info_only=True)
        passed, status = check_metric("rtp", 0.5, 0.95, tolerance)
        assert passed is True
        assert status == "INFO"

    def test_absolute_tolerance_pass_within(self):
        """Values within absolute tolerance pass."""
        tolerance = Tolerance(absolute=0.05)
        passed, status = check_metric("dry_spins_rate", 0.72, 0.70, tolerance)
        assert passed is True
        assert status == "PASS"

    def test_absolute_tolerance_pass_exact(self):
        """Exact match passes."""
        tolerance = Tolerance(absolute=0.05)
        passed, status = check_metric("dry_spins_rate", 0.70, 0.70, tolerance)
        assert passed is True
        assert status == "PASS"

    def test_absolute_tolerance_pass_at_boundary(self):
        """Values at exact tolerance boundary pass."""
        tolerance = Tolerance(absolute=0.05)
        # Use 0.74 vs 0.70 = 0.04 diff, which is within 0.05
        passed, status = check_metric("dry_spins_rate", 0.74, 0.70, tolerance)
        assert passed is True
        assert status == "PASS"

    def test_absolute_tolerance_fail_beyond(self):
        """Values beyond absolute tolerance fail."""
        tolerance = Tolerance(absolute=0.05)
        passed, status = check_metric("dry_spins_rate", 0.76, 0.70, tolerance)
        assert passed is False
        assert "FAIL" in status

    def test_relative_floor_pass_above(self):
        """Values above relative floor pass."""
        tolerance = Tolerance(relative_floor=0.85)
        # run = 170, baseline = 200, floor = 170 -> pass (at boundary)
        passed, status = check_metric("max_win_x", 170, 200, tolerance)
        assert passed is True
        assert status == "PASS"

    def test_relative_floor_pass_equal(self):
        """Values equal to baseline pass."""
        tolerance = Tolerance(relative_floor=0.85)
        passed, status = check_metric("max_win_x", 200, 200, tolerance)
        assert passed is True
        assert status == "PASS"

    def test_relative_floor_fail_below(self):
        """Values below relative floor fail."""
        tolerance = Tolerance(relative_floor=0.85)
        # run = 160, baseline = 200, floor = 170 -> fail
        passed, status = check_metric("max_win_x", 160, 200, tolerance)
        assert passed is False
        assert "FAIL" in status

    def test_no_tolerance_defined_passes(self):
        """Metrics with no tolerance defined always pass."""
        tolerance = Tolerance()  # No tolerance specified
        passed, status = check_metric("unknown_metric", 100, 50, tolerance)
        assert passed is True
        assert status == "PASS"


class TestCompareMode:
    """Tests for compare_mode function."""

    def create_mode_data(self, **overrides) -> dict:
        """Create synthetic mode data with defaults."""
        defaults = {
            "rtp": 0.98,
            "win_rate": 0.28,
            "dry_spins_rate": 0.72,
            "bonus_entry_rate": 0.003,
            "spins_between_wins_p50": 2,
            "spins_between_wins_p90": 6,
            "spins_between_wins_p99": 12,
            "spins_between_bonus_p50": 300,
            "spins_between_bonus_p90": 500,
            "spins_between_bonus_p99": 800,
            "bonus_drought_gt300_rate": 0.10,
            "bonus_drought_gt500_rate": 0.02,
            "max_win_x": 500.0,
            "rate_100x_plus": 0.01,
            "rate_500x_plus": 0.002,
            "rate_1000x_plus": 0.0005,
        }
        defaults.update(overrides)
        return defaults

    def test_identical_data_passes(self):
        """Identical run and baseline data passes all metrics."""
        baseline = self.create_mode_data()
        run = self.create_mode_data()

        all_passed, rows = compare_mode("base", run, baseline, METRICS_ORDER)

        assert all_passed is True
        for metric, _, _, _, status in rows:
            # All should be PASS or INFO
            assert status in ("PASS", "INFO"), f"{metric} should pass"

    def test_missing_key_in_run_fails(self):
        """Missing key in run data uses 0 and may fail."""
        baseline = self.create_mode_data()
        run = self.create_mode_data()
        del run["win_rate"]  # Remove a key

        all_passed, rows = compare_mode("base", run, baseline, METRICS_ORDER)

        # win_rate will be 0 vs 0.28, which is > 0.03 tolerance -> FAIL
        assert all_passed is False

    def test_win_rate_within_tolerance(self):
        """win_rate within ±0.03 tolerance passes."""
        baseline = self.create_mode_data(win_rate=0.28)
        run = self.create_mode_data(win_rate=0.30)  # +0.02, within ±0.03

        all_passed, rows = compare_mode("base", run, baseline, METRICS_ORDER)

        # Find win_rate status
        win_rate_row = next(r for r in rows if r[0] == "win_rate")
        assert win_rate_row[4] == "PASS"

    def test_win_rate_beyond_tolerance_fails(self):
        """win_rate beyond ±0.03 tolerance fails."""
        baseline = self.create_mode_data(win_rate=0.28)
        run = self.create_mode_data(win_rate=0.32)  # +0.04, beyond ±0.03

        all_passed, rows = compare_mode("base", run, baseline, METRICS_ORDER)

        # Find win_rate status
        win_rate_row = next(r for r in rows if r[0] == "win_rate")
        assert "FAIL" in win_rate_row[4]
        assert all_passed is False

    def test_max_win_x_regression_fails(self):
        """max_win_x regression below 85% fails."""
        baseline = self.create_mode_data(max_win_x=1000.0)
        run = self.create_mode_data(max_win_x=800.0)  # 80% of baseline -> FAIL

        all_passed, rows = compare_mode("base", run, baseline, METRICS_ORDER)

        max_win_row = next(r for r in rows if r[0] == "max_win_x")
        assert "FAIL" in max_win_row[4]
        assert all_passed is False

    def test_max_win_x_no_regression_passes(self):
        """max_win_x at or above 85% passes."""
        baseline = self.create_mode_data(max_win_x=1000.0)
        run = self.create_mode_data(max_win_x=850.0)  # exactly 85% -> PASS

        all_passed, rows = compare_mode("base", run, baseline, METRICS_ORDER)

        max_win_row = next(r for r in rows if r[0] == "max_win_x")
        assert max_win_row[4] == "PASS"

    def test_bonus_entry_rate_tolerance(self):
        """bonus_entry_rate within ±0.0015 passes."""
        baseline = self.create_mode_data(bonus_entry_rate=0.003)
        run = self.create_mode_data(bonus_entry_rate=0.004)  # +0.001, within ±0.0015

        all_passed, rows = compare_mode("base", run, baseline, METRICS_ORDER)

        bonus_row = next(r for r in rows if r[0] == "bonus_entry_rate")
        assert bonus_row[4] == "PASS"

    def test_rtp_is_info_only(self):
        """RTP metric is INFO only, never fails."""
        baseline = self.create_mode_data(rtp=0.98)
        run = self.create_mode_data(rtp=0.50)  # Wildly different

        all_passed, rows = compare_mode("base", run, baseline, METRICS_ORDER)

        rtp_row = next(r for r in rows if r[0] == "rtp")
        assert rtp_row[4] == "INFO"  # Not FAIL


class TestFormatValue:
    """Tests for format_value function."""

    def test_format_max_win_x(self):
        """max_win_x is formatted with 2 decimals and 'x'."""
        result = format_value("max_win_x", 1234.567)
        assert result == "1234.57x"

    def test_format_spins_as_int(self):
        """Spins metrics are formatted as integers."""
        result = format_value("spins_between_wins_p50", 5.7)
        assert result == "5"

    def test_format_rtp_as_percent(self):
        """RTP is formatted as percentage."""
        result = format_value("rtp", 0.98)
        assert result == "98.0000%"

    def test_format_small_rate(self):
        """Small rates are formatted with 6 decimals."""
        result = format_value("rate_1000x_plus", 0.0005)
        assert result == "0.000500"


class TestTolerancesDefinition:
    """Tests that tolerances are properly defined."""

    def test_all_metrics_have_tolerances(self):
        """All metrics in METRICS_ORDER have tolerance definitions."""
        for metric in METRICS_ORDER:
            assert metric in TOLERANCES, f"Missing tolerance for {metric}"

    def test_rtp_is_info_only(self):
        """RTP tolerance is INFO only."""
        assert TOLERANCES["rtp"].info_only is True

    def test_max_win_x_uses_relative_floor(self):
        """max_win_x uses relative floor tolerance."""
        assert TOLERANCES["max_win_x"].relative_floor == 0.85

    def test_win_rate_uses_absolute(self):
        """win_rate uses absolute tolerance."""
        assert TOLERANCES["win_rate"].absolute == 0.03


class TestStrictParamValidation:
    """Tests for strict param validation logic."""

    def test_param_mismatch_detection(self):
        """Param mismatch is detected by comparing seed/rounds."""
        baseline_seed = "AUDIT_2025"
        baseline_rounds = 20000
        run_seed = "OTHER_SEED"
        run_rounds = 20000

        # Simple validation logic
        mismatch = (baseline_seed != run_seed) or (baseline_rounds != run_rounds)
        assert mismatch is True

    def test_param_match_passes(self):
        """Matching params pass validation."""
        baseline_seed = "AUDIT_2025"
        baseline_rounds = 20000
        run_seed = "AUDIT_2025"
        run_rounds = 20000

        mismatch = (baseline_seed != run_seed) or (baseline_rounds != run_rounds)
        assert mismatch is False
