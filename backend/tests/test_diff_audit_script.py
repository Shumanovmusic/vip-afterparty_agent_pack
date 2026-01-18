"""
Tests for diff_audit.py script.

Verifies comparison logic and file handling.
"""
import tempfile
from pathlib import Path

import pytest

from scripts.diff_audit import (
    DEFAULT_TOLERANCE_BONUS_RATE,
    DEFAULT_TOLERANCE_HIT_FREQ,
    DEFAULT_TOLERANCE_RTP,
    REQUIRED_COMPARE_FIELDS,
    compare_results,
    compare_to_reference,
    get_reference_params,
    load_csv_row,
    validate_config_match,
    validate_params_match,
    validate_reference_csv,
)


class TestCompareResults:
    """Tests for compare_results function."""

    def test_identical_results_return_true(self) -> None:
        """Identical simulation results should return is_identical=True."""
        run_a = {
            "config_hash": "abc123",
            "mode": "base",
            "rounds": "20000",
            "seed": "TEST_SEED",
            "rtp": "98.0000",
            "hit_freq": "28.7400",
            "bonus_entry_rate": "0.2650",
            "avg_debit": "1.0000",
            "avg_credit": "0.9800",
            "max_win_x": "213.06",
            "rate_1000x_plus": "0.000000",
            "rate_10000x_plus": "0.000000",
            "capped_rate": "0.000000",
        }
        run_b = run_a.copy()

        is_identical, differences = compare_results(run_a, run_b, "base")

        assert is_identical is True
        assert len(differences) == 0

    def test_different_rtp_returns_false(self) -> None:
        """Different RTP values should return is_identical=False."""
        run_a = {
            "config_hash": "abc123",
            "mode": "base",
            "rounds": "20000",
            "seed": "TEST_SEED",
            "rtp": "98.0000",
            "hit_freq": "28.7400",
            "bonus_entry_rate": "0.2650",
            "avg_debit": "1.0000",
            "avg_credit": "0.9800",
            "max_win_x": "213.06",
            "rate_1000x_plus": "0.000000",
            "rate_10000x_plus": "0.000000",
            "capped_rate": "0.000000",
        }
        run_b = run_a.copy()
        run_b["rtp"] = "97.5000"  # Different RTP

        is_identical, differences = compare_results(run_a, run_b, "base")

        assert is_identical is False
        assert len(differences) > 0
        assert any("rtp" in d for d in differences)

    def test_config_hash_mismatch_is_critical(self) -> None:
        """Config hash mismatch should be flagged as CRITICAL."""
        run_a = {
            "config_hash": "abc123",
            "mode": "base",
            "rounds": "20000",
            "seed": "TEST_SEED",
            "rtp": "98.0000",
            "hit_freq": "28.7400",
            "bonus_entry_rate": "0.2650",
            "avg_debit": "1.0000",
            "avg_credit": "0.9800",
            "max_win_x": "213.06",
            "rate_1000x_plus": "0.000000",
            "rate_10000x_plus": "0.000000",
            "capped_rate": "0.000000",
        }
        run_b = run_a.copy()
        run_b["config_hash"] = "xyz789"  # Different config hash

        is_identical, differences = compare_results(run_a, run_b, "base")

        assert is_identical is False
        assert any("CRITICAL" in d and "config_hash" in d for d in differences)


class TestLoadCsvRow:
    """Tests for load_csv_row function."""

    def test_missing_file_returns_none(self) -> None:
        """Missing file should return None gracefully."""
        result = load_csv_row(Path("/nonexistent/path/to/file.csv"))
        assert result is None

    def test_valid_csv_returns_dict(self) -> None:
        """Valid CSV file should return dict with values."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write("config_hash,mode,rounds,rtp\n")
            f.write("abc123,base,20000,98.0000\n")
            f.flush()

            result = load_csv_row(Path(f.name))

            assert result is not None
            assert result["config_hash"] == "abc123"
            assert result["mode"] == "base"
            assert result["rounds"] == "20000"
            assert result["rtp"] == "98.0000"

            # Cleanup
            Path(f.name).unlink()

    def test_empty_csv_returns_none(self) -> None:
        """CSV with only headers (no data rows) should return None."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write("config_hash,mode,rounds,rtp\n")
            f.flush()

            result = load_csv_row(Path(f.name))

            assert result is None

            # Cleanup
            Path(f.name).unlink()


class TestValidateReferenceCsv:
    """Tests for validate_reference_csv function."""

    def test_compare_to_requires_file_exists(self) -> None:
        """Non-existent file path should fail gracefully via load_csv_row."""
        result = load_csv_row(Path("/nonexistent/path/to/reference.csv"))
        assert result is None

    def test_compare_to_requires_single_row(self) -> None:
        """CSV with only headers (no data) should return None from load_csv_row."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            headers = ",".join(REQUIRED_COMPARE_FIELDS)
            f.write(f"{headers}\n")
            f.flush()

            result = load_csv_row(Path(f.name))
            assert result is None

            Path(f.name).unlink()

    def test_compare_to_missing_required_fields_fails(self) -> None:
        """Reference CSV missing required fields should fail validation."""
        incomplete_row = {
            "config_hash": "abc123",
            "mode": "base",
            # Missing many required fields
        }

        is_valid, missing = validate_reference_csv(incomplete_row)

        assert is_valid is False
        assert len(missing) > 0
        assert "rtp" in missing
        assert "hit_freq" in missing


class TestCompareToReference:
    """Tests for compare_to_reference function."""

    def _make_complete_row(self, overrides: dict[str, str] | None = None) -> dict[str, str]:
        """Create a complete row with all required fields."""
        base_row = {
            "config_hash": "abc123",
            "mode": "base",
            "rounds": "20000",
            "seed": "TEST_SEED",
            "debit_multiplier": "1.00",
            "rtp": "98.0000",
            "hit_freq": "28.7400",
            "bonus_entry_rate": "0.2650",
            "p95_win_x": "10.50",
            "p99_win_x": "45.30",
            "max_win_x": "213.06",
            "rate_1000x_plus": "0.000000",
            "rate_10000x_plus": "0.000000",
            "capped_rate": "0.000000",
            "scatter_chance_base": "0.0200",
            "scatter_chance_effective": "0.0200",
            "scatter_chance_multiplier": "1.00",
        }
        if overrides:
            base_row.update(overrides)
        return base_row

    def test_compare_to_passes_with_same_values(self) -> None:
        """Identical rows should pass comparison."""
        run_row = self._make_complete_row()
        ref_row = self._make_complete_row()
        tolerances: dict[str, float] = {}

        passed, differences = compare_to_reference(run_row, ref_row, tolerances)

        assert passed is True
        assert len([d for d in differences if d.startswith("FAIL:")]) == 0

    def test_compare_to_fails_when_rtp_outside_tolerance(self) -> None:
        """RTP difference beyond tolerance should fail."""
        run_row = self._make_complete_row({"rtp": "98.0000"})
        ref_row = self._make_complete_row({"rtp": "97.9700"})  # 0.03 diff > 0.02 default
        tolerances = {"rtp": DEFAULT_TOLERANCE_RTP}

        passed, differences = compare_to_reference(run_row, ref_row, tolerances)

        assert passed is False
        assert any("rtp" in d and "FAIL" in d for d in differences)

    def test_compare_to_passes_when_rtp_within_tolerance(self) -> None:
        """RTP difference within tolerance should pass."""
        run_row = self._make_complete_row({"rtp": "98.0000"})
        ref_row = self._make_complete_row({"rtp": "97.9900"})  # 0.01 diff < 0.02 default
        tolerances = {"rtp": DEFAULT_TOLERANCE_RTP}

        passed, differences = compare_to_reference(run_row, ref_row, tolerances)

        # Should pass (no FAIL for rtp)
        rtp_failures = [d for d in differences if "rtp" in d and "FAIL" in d]
        assert len(rtp_failures) == 0

    def test_compare_to_exact_scatter_fields_enforced(self) -> None:
        """Scatter fields must match exactly (no tolerance)."""
        run_row = self._make_complete_row({"scatter_chance_base": "0.0200"})
        ref_row = self._make_complete_row({"scatter_chance_base": "0.0201"})
        tolerances: dict[str, float] = {}

        passed, differences = compare_to_reference(run_row, ref_row, tolerances)

        assert passed is False
        assert any("scatter_chance_base" in d and "FAIL" in d for d in differences)

    def test_compare_to_warns_on_config_hash_mismatch(self) -> None:
        """Config hash mismatch should generate warning but not fail."""
        run_row = self._make_complete_row({"config_hash": "abc123"})
        ref_row = self._make_complete_row({"config_hash": "xyz789"})
        tolerances: dict[str, float] = {}

        passed, differences = compare_to_reference(run_row, ref_row, tolerances)

        # Should still pass (warning, not failure)
        assert passed is True
        assert any("WARNING" in d and "config_hash" in d for d in differences)

    def test_compare_to_fails_on_mode_mismatch(self) -> None:
        """Mode mismatch should fail immediately."""
        run_row = self._make_complete_row({"mode": "base"})
        ref_row = self._make_complete_row({"mode": "buy"})
        tolerances: dict[str, float] = {}

        passed, differences = compare_to_reference(run_row, ref_row, tolerances)

        assert passed is False
        assert any("mode mismatch" in d for d in differences)


class TestValidateParamsMatch:
    """Tests for validate_params_match function (strict param validation)."""

    def test_mismatch_rounds_triggers_fail_fast(self) -> None:
        """Mismatched rounds should fail validation with clear message."""
        is_match, error_msg = validate_params_match(
            cli_mode="base",
            cli_rounds=20000,
            cli_seed="AUDIT_2025",
            ref_mode="base",
            ref_rounds=100000,  # Different rounds
            ref_seed="AUDIT_2025",
        )

        assert is_match is False
        assert "rounds" in error_msg
        assert "100000" in error_msg
        assert "20000" in error_msg
        assert "--use-reference-params" in error_msg

    def test_mismatch_seed_triggers_fail_fast(self) -> None:
        """Mismatched seed should fail validation with clear message."""
        is_match, error_msg = validate_params_match(
            cli_mode="base",
            cli_rounds=100000,
            cli_seed="WRONG_SEED",  # Different seed
            ref_mode="base",
            ref_rounds=100000,
            ref_seed="AUDIT_2025",
        )

        assert is_match is False
        assert "seed" in error_msg
        assert "WRONG_SEED" in error_msg
        assert "AUDIT_2025" in error_msg

    def test_mismatch_mode_triggers_fail_fast(self) -> None:
        """Mismatched mode should fail validation with clear message."""
        is_match, error_msg = validate_params_match(
            cli_mode="buy",  # Different mode
            cli_rounds=100000,
            cli_seed="AUDIT_2025",
            ref_mode="base",
            ref_rounds=100000,
            ref_seed="AUDIT_2025",
        )

        assert is_match is False
        assert "mode" in error_msg
        assert "buy" in error_msg
        assert "base" in error_msg

    def test_matching_params_pass_validation(self) -> None:
        """All matching params should pass validation."""
        is_match, error_msg = validate_params_match(
            cli_mode="base",
            cli_rounds=100000,
            cli_seed="AUDIT_2025",
            ref_mode="base",
            ref_rounds=100000,
            ref_seed="AUDIT_2025",
        )

        assert is_match is True
        assert error_msg == ""


class TestValidateConfigMatch:
    """Tests for validate_config_match function."""

    def test_mismatch_config_hash_triggers_fail_fast(self) -> None:
        """Mismatched config_hash should fail with clear message."""
        is_match, error_msg = validate_config_match(
            run_config_hash="abc123",
            ref_config_hash="xyz789",  # Different hash
            run_debit_multiplier="1.00",
            ref_debit_multiplier="1.00",
        )

        assert is_match is False
        assert "config_hash" in error_msg
        assert "abc123" in error_msg
        assert "xyz789" in error_msg

    def test_mismatch_debit_multiplier_triggers_fail_fast(self) -> None:
        """Mismatched debit_multiplier should fail with clear message."""
        is_match, error_msg = validate_config_match(
            run_config_hash="abc123",
            ref_config_hash="abc123",
            run_debit_multiplier="100.00",  # Different multiplier
            ref_debit_multiplier="1.00",
        )

        assert is_match is False
        assert "debit_multiplier" in error_msg
        assert "100.00" in error_msg
        assert "1.00" in error_msg

    def test_matching_config_passes_validation(self) -> None:
        """Matching config should pass validation."""
        is_match, error_msg = validate_config_match(
            run_config_hash="abc123",
            ref_config_hash="abc123",
            run_debit_multiplier="1.00",
            ref_debit_multiplier="1.00",
        )

        assert is_match is True
        assert error_msg == ""


class TestGetReferenceParams:
    """Tests for get_reference_params function."""

    def test_extracts_params_from_reference_row(self) -> None:
        """Should extract mode, rounds, seed from reference CSV row."""
        ref_row = {
            "mode": "base",
            "rounds": "100000",
            "seed": "AUDIT_2025",
            "config_hash": "abc123",
        }

        mode, rounds, seed = get_reference_params(ref_row)

        assert mode == "base"
        assert rounds == 100000
        assert seed == "AUDIT_2025"

    def test_handles_missing_fields_gracefully(self) -> None:
        """Should return defaults for missing fields."""
        ref_row: dict[str, str] = {}

        mode, rounds, seed = get_reference_params(ref_row)

        assert mode == ""
        assert rounds == 0
        assert seed == ""


class TestUseReferenceParamsMode:
    """Tests for --use-reference-params behavior."""

    def test_use_reference_params_ignores_cli_mode(self) -> None:
        """When --use-reference-params is set, CLI mode should be ignored."""
        # This is a unit test for the concept - the actual flag handling
        # is in run_compare_to_mode which requires full integration testing.
        # Here we just verify the validation function allows None cli_mode
        # when use_reference_params would be set.
        is_match, error_msg = validate_params_match(
            cli_mode=None,  # Mode not provided (--use-reference-params case)
            cli_rounds=100000,
            cli_seed="AUDIT_2025",
            ref_mode="base",
            ref_rounds=100000,
            ref_seed="AUDIT_2025",
        )

        # When cli_mode is None, it should pass if other params match
        # (the actual mode comes from reference)
        assert is_match is True

    def test_validate_params_match_with_none_mode_and_matching_rounds_seed(self) -> None:
        """None mode with matching rounds/seed should pass (for --use-reference-params)."""
        is_match, error_msg = validate_params_match(
            cli_mode=None,
            cli_rounds=50000,
            cli_seed="TEST_SEED",
            ref_mode="buy",
            ref_rounds=50000,
            ref_seed="TEST_SEED",
        )

        assert is_match is True
        assert error_msg == ""
