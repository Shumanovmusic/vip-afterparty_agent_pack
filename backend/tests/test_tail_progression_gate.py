"""
Tests for tail_progression.py script.

Verifies fail-fast behavior and regression detection logic.
Uses fake baseline/run data - NO heavy simulations.
"""
import pytest

from scripts.tail_progression import (
    DEFAULT_TOLERANCE_MAX_WIN_X,
    DEFAULT_TOLERANCE_RATE_1000X_PLUS,
    DEFAULT_TOLERANCE_RATE_10000X_PLUS,
    REQUIRED_BASELINE_FIELDS,
    check_tail_regression,
    get_baseline_params,
    validate_baseline_csv,
    validate_config_match,
    validate_params_match,
)


class TestValidateBaselineCsv:
    """Tests for validate_baseline_csv function."""

    def test_valid_baseline_passes(self) -> None:
        """Complete baseline with all required fields should pass."""
        baseline_row = {
            "config_hash": "abc123",
            "mode": "buy",
            "rounds": "20000",
            "seed": "AUDIT_2025",
            "debit_multiplier": "100.00",
            "rate_1000x_plus": "0.500000",
            "rate_10000x_plus": "0.000000",
            "max_win_x": "2000.00",
            "capped_rate": "0.000000",
        }

        is_valid, missing = validate_baseline_csv(baseline_row)

        assert is_valid is True
        assert len(missing) == 0

    def test_missing_required_fields_fails(self) -> None:
        """Baseline missing required fields should fail."""
        incomplete_row = {
            "config_hash": "abc123",
            "mode": "buy",
            # Missing many required fields
        }

        is_valid, missing = validate_baseline_csv(incomplete_row)

        assert is_valid is False
        assert len(missing) > 0
        assert "rate_1000x_plus" in missing
        assert "max_win_x" in missing


class TestGetBaselineParams:
    """Tests for get_baseline_params function."""

    def test_extracts_params_from_baseline_row(self) -> None:
        """Should extract mode, rounds, seed from baseline CSV row."""
        baseline_row = {
            "mode": "buy",
            "rounds": "20000",
            "seed": "AUDIT_2025",
            "config_hash": "abc123",
        }

        mode, rounds, seed = get_baseline_params(baseline_row)

        assert mode == "buy"
        assert rounds == 20000
        assert seed == "AUDIT_2025"

    def test_handles_missing_fields_gracefully(self) -> None:
        """Should return defaults for missing fields."""
        baseline_row: dict[str, str] = {}

        mode, rounds, seed = get_baseline_params(baseline_row)

        assert mode == ""
        assert rounds == 0
        assert seed == ""


class TestValidateParamsMatch:
    """Tests for validate_params_match function (strict param validation)."""

    def test_matching_params_pass(self) -> None:
        """All matching params should pass validation."""
        is_match, error_msg = validate_params_match(
            cli_mode="buy",
            cli_rounds=20000,
            cli_seed="AUDIT_2025",
            baseline_mode="buy",
            baseline_rounds=20000,
            baseline_seed="AUDIT_2025",
        )

        assert is_match is True
        assert error_msg == ""

    def test_mismatch_mode_fails(self) -> None:
        """Mismatched mode should fail validation."""
        is_match, error_msg = validate_params_match(
            cli_mode="base",  # Wrong mode
            cli_rounds=20000,
            cli_seed="AUDIT_2025",
            baseline_mode="buy",
            baseline_rounds=20000,
            baseline_seed="AUDIT_2025",
        )

        assert is_match is False
        assert "mode" in error_msg
        assert "base" in error_msg
        assert "buy" in error_msg

    def test_mismatch_rounds_fails(self) -> None:
        """Mismatched rounds should fail validation."""
        is_match, error_msg = validate_params_match(
            cli_mode="buy",
            cli_rounds=50000,  # Wrong rounds
            cli_seed="AUDIT_2025",
            baseline_mode="buy",
            baseline_rounds=20000,
            baseline_seed="AUDIT_2025",
        )

        assert is_match is False
        assert "rounds" in error_msg
        assert "50000" in error_msg
        assert "20000" in error_msg

    def test_mismatch_seed_fails(self) -> None:
        """Mismatched seed should fail validation."""
        is_match, error_msg = validate_params_match(
            cli_mode="buy",
            cli_rounds=20000,
            cli_seed="WRONG_SEED",  # Wrong seed
            baseline_mode="buy",
            baseline_rounds=20000,
            baseline_seed="AUDIT_2025",
        )

        assert is_match is False
        assert "seed" in error_msg
        assert "WRONG_SEED" in error_msg
        assert "AUDIT_2025" in error_msg

    def test_none_mode_passes_if_other_params_match(self) -> None:
        """None mode (use baseline) with matching rounds/seed should pass."""
        is_match, error_msg = validate_params_match(
            cli_mode=None,  # Use baseline mode
            cli_rounds=20000,
            cli_seed="AUDIT_2025",
            baseline_mode="buy",
            baseline_rounds=20000,
            baseline_seed="AUDIT_2025",
        )

        assert is_match is True
        assert error_msg == ""


class TestValidateConfigMatch:
    """Tests for validate_config_match function."""

    def test_matching_config_passes(self) -> None:
        """Matching config should pass validation."""
        is_match, error_msg = validate_config_match(
            run_config_hash="abc123",
            baseline_config_hash="abc123",
            run_debit_multiplier="100.00",
            baseline_debit_multiplier="100.00",
        )

        assert is_match is True
        assert error_msg == ""

    def test_mismatch_config_hash_fails(self) -> None:
        """Mismatched config_hash should fail validation."""
        is_match, error_msg = validate_config_match(
            run_config_hash="abc123",
            baseline_config_hash="xyz789",  # Different hash
            run_debit_multiplier="100.00",
            baseline_debit_multiplier="100.00",
        )

        assert is_match is False
        assert "config_hash" in error_msg
        assert "abc123" in error_msg
        assert "xyz789" in error_msg

    def test_mismatch_debit_multiplier_fails(self) -> None:
        """Mismatched debit_multiplier should fail validation."""
        is_match, error_msg = validate_config_match(
            run_config_hash="abc123",
            baseline_config_hash="abc123",
            run_debit_multiplier="1.00",  # Different multiplier
            baseline_debit_multiplier="100.00",
        )

        assert is_match is False
        assert "debit_multiplier" in error_msg
        assert "1.00" in error_msg
        assert "100.00" in error_msg


class TestCheckTailRegression:
    """Tests for check_tail_regression function."""

    def _make_row(self, overrides: dict[str, str] | None = None) -> dict[str, str]:
        """Create a complete row with all required fields."""
        base_row = {
            "config_hash": "abc123",
            "mode": "buy",
            "rounds": "20000",
            "seed": "AUDIT_2025",
            "debit_multiplier": "100.00",
            "rate_1000x_plus": "0.500000",
            "rate_10000x_plus": "0.000000",
            "max_win_x": "2000.00",
            "capped_rate": "0.000000",
        }
        if overrides:
            base_row.update(overrides)
        return base_row

    def test_identical_values_pass(self) -> None:
        """Identical run and baseline should pass."""
        run_row = self._make_row()
        baseline_row = self._make_row()
        tolerances: dict[str, float] = {}

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        assert passed is True
        assert all("PASS" in msg for msg in messages)

    def test_better_values_pass(self) -> None:
        """Run values better than baseline should pass."""
        run_row = self._make_row({
            "rate_1000x_plus": "0.600000",  # Better than baseline
            "max_win_x": "2500.00",  # Better than baseline
        })
        baseline_row = self._make_row({
            "rate_1000x_plus": "0.500000",
            "max_win_x": "2000.00",
        })
        tolerances: dict[str, float] = {}

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        assert passed is True
        assert all("PASS" in msg for msg in messages)

    def test_rate_1000x_plus_regression_fails(self) -> None:
        """Regression in rate_1000x_plus beyond tolerance should fail."""
        run_row = self._make_row({
            "rate_1000x_plus": "0.200000",  # Worse: 0.2 < 0.5 - 0.2 = 0.3
        })
        baseline_row = self._make_row({
            "rate_1000x_plus": "0.500000",
        })
        tolerances = {"rate_1000x_plus": DEFAULT_TOLERANCE_RATE_1000X_PLUS}

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        assert passed is False
        assert any("FAIL" in msg and "rate_1000x_plus" in msg for msg in messages)

    def test_rate_1000x_plus_within_tolerance_passes(self) -> None:
        """Rate within tolerance should pass."""
        run_row = self._make_row({
            "rate_1000x_plus": "0.350000",  # Slightly worse but within tolerance: 0.35 >= 0.5 - 0.2 = 0.3
        })
        baseline_row = self._make_row({
            "rate_1000x_plus": "0.500000",
        })
        tolerances = {"rate_1000x_plus": DEFAULT_TOLERANCE_RATE_1000X_PLUS}

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        assert passed is True
        assert any("PASS" in msg and "rate_1000x_plus" in msg for msg in messages)

    def test_max_win_x_regression_fails(self) -> None:
        """Regression in max_win_x beyond tolerance should fail."""
        run_row = self._make_row({
            "max_win_x": "1800.00",  # Worse: 1800 < 2000 - 100 = 1900
        })
        baseline_row = self._make_row({
            "max_win_x": "2000.00",
        })
        tolerances = {"max_win_x": DEFAULT_TOLERANCE_MAX_WIN_X}

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        assert passed is False
        assert any("FAIL" in msg and "max_win_x" in msg for msg in messages)

    def test_max_win_x_within_tolerance_passes(self) -> None:
        """Max win within tolerance should pass."""
        run_row = self._make_row({
            "max_win_x": "1950.00",  # Slightly worse but within tolerance: 1950 >= 2000 - 100 = 1900
        })
        baseline_row = self._make_row({
            "max_win_x": "2000.00",
        })
        tolerances = {"max_win_x": DEFAULT_TOLERANCE_MAX_WIN_X}

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        assert passed is True
        assert any("PASS" in msg and "max_win_x" in msg for msg in messages)

    def test_zero_baseline_allows_zero_run(self) -> None:
        """If baseline is 0, run being 0 is not regression."""
        run_row = self._make_row({
            "rate_10000x_plus": "0.000000",
        })
        baseline_row = self._make_row({
            "rate_10000x_plus": "0.000000",
        })
        tolerances: dict[str, float] = {}

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        assert passed is True
        assert any("no regression possible" in msg.lower() for msg in messages)

    def test_run_better_than_zero_baseline_passes(self) -> None:
        """Run better than zero baseline should pass."""
        run_row = self._make_row({
            "rate_10000x_plus": "0.010000",  # Better than 0
        })
        baseline_row = self._make_row({
            "rate_10000x_plus": "0.000000",
        })
        tolerances: dict[str, float] = {}

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        assert passed is True


class TestTailProgressionIntegration:
    """Integration-level tests for tail progression logic."""

    def test_all_checks_run_independently(self) -> None:
        """All tail metrics should be checked independently."""
        # One field fails, others pass
        run_row = {
            "config_hash": "abc123",
            "mode": "buy",
            "rounds": "20000",
            "seed": "AUDIT_2025",
            "debit_multiplier": "100.00",
            "rate_1000x_plus": "0.100000",  # FAIL: regression
            "rate_10000x_plus": "0.000000",  # PASS: baseline 0
            "max_win_x": "2500.00",  # PASS: better
            "capped_rate": "0.000000",
        }
        baseline_row = {
            "config_hash": "abc123",
            "mode": "buy",
            "rounds": "20000",
            "seed": "AUDIT_2025",
            "debit_multiplier": "100.00",
            "rate_1000x_plus": "0.500000",
            "rate_10000x_plus": "0.000000",
            "max_win_x": "2000.00",
            "capped_rate": "0.000000",
        }
        tolerances: dict[str, float] = {
            "rate_1000x_plus": DEFAULT_TOLERANCE_RATE_1000X_PLUS,
            "rate_10000x_plus": DEFAULT_TOLERANCE_RATE_10000X_PLUS,
            "max_win_x": DEFAULT_TOLERANCE_MAX_WIN_X,
        }

        passed, messages = check_tail_regression(run_row, baseline_row, tolerances)

        # Should fail overall because rate_1000x_plus regressed
        assert passed is False
        # Should have individual status for each field
        assert any("rate_1000x_plus" in msg and "FAIL" in msg for msg in messages)
        assert any("rate_10000x_plus" in msg and "PASS" in msg for msg in messages)
        assert any("max_win_x" in msg and "PASS" in msg for msg in messages)

    def test_custom_tolerances_respected(self) -> None:
        """Custom tolerances should be used instead of defaults."""
        run_row = {
            "config_hash": "abc123",
            "mode": "buy",
            "rounds": "20000",
            "seed": "AUDIT_2025",
            "debit_multiplier": "100.00",
            "rate_1000x_plus": "0.400000",  # Would fail with default tolerance
            "rate_10000x_plus": "0.000000",
            "max_win_x": "1800.00",  # Would fail with default tolerance
            "capped_rate": "0.000000",
        }
        baseline_row = {
            "config_hash": "abc123",
            "mode": "buy",
            "rounds": "20000",
            "seed": "AUDIT_2025",
            "debit_multiplier": "100.00",
            "rate_1000x_plus": "0.500000",
            "rate_10000x_plus": "0.000000",
            "max_win_x": "2000.00",
            "capped_rate": "0.000000",
        }

        # With default tolerances: should fail
        default_tolerances: dict[str, float] = {
            "rate_1000x_plus": DEFAULT_TOLERANCE_RATE_1000X_PLUS,  # 0.2
            "max_win_x": DEFAULT_TOLERANCE_MAX_WIN_X,  # 100.0
        }
        passed, _ = check_tail_regression(run_row, baseline_row, default_tolerances)
        assert passed is False

        # With relaxed tolerances: should pass
        relaxed_tolerances = {
            "rate_1000x_plus": 0.15,  # More lenient
            "rate_10000x_plus": 0.01,
            "max_win_x": 250.0,  # More lenient
        }
        passed, _ = check_tail_regression(run_row, baseline_row, relaxed_tolerances)
        assert passed is True
