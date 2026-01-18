"""
Tests for diff_audit.py script.

Verifies comparison logic and file handling.
"""
import tempfile
from pathlib import Path

import pytest

from scripts.diff_audit import compare_results, load_csv_row


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
