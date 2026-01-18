"""
Tail Gate tests per CONFIG.md and GAME_RULES.md.

Enforces that tail distribution is measurable and not silently "dead".

Tests:
A) audit_sim output includes required columns
B) buy mode "tail is measurable" (rate_1000x_plus > 0)
C) cap never exceeded (max_win_x <= MAX_WIN_TOTAL_X)

Note: Marked as @slow - requires running simulation. Skipped in quick CI.
"""
import csv

import pytest
pytestmark = pytest.mark.slow  # All tests in this module are slow
from io import StringIO
from pathlib import Path

from app.logic.engine import MAX_WIN_TOTAL_X
from scripts.audit_sim import run_simulation, generate_csv, SimulationStats, get_config_hash


# CONFIG.md: TAIL_GATE_ROUNDS_BUY=50000
# Using smaller value for test speed, but still meaningful
TAIL_GATE_ROUNDS_BUY = 20000  # ~20k rounds for reasonable test time (~30s)

# Required CSV columns per task spec
REQUIRED_CSV_COLUMNS = [
    "rate_1000x_plus",
    "rate_10000x_plus",
    "capped_rate",
    "max_win_x",
    "debit_multiplier",
    "avg_debit",
    "avg_credit",
]


class TestAuditSimCSVColumns:
    """Test A: audit_sim output includes required columns."""

    def test_csv_has_rate_1000x_plus(self, tmp_path):
        """CSV must include rate_1000x_plus column."""
        csv_path = tmp_path / "test_output.csv"

        # Run minimal simulation
        stats = run_simulation(mode="base", rounds=1000, seed_str="TEST_CSV", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="TEST_CSV", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
            assert "rate_1000x_plus" in row, "CSV must include rate_1000x_plus column"

    def test_csv_has_rate_10000x_plus(self, tmp_path):
        """CSV must include rate_10000x_plus column."""
        csv_path = tmp_path / "test_output.csv"

        stats = run_simulation(mode="base", rounds=1000, seed_str="TEST_CSV", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="TEST_CSV", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
            assert "rate_10000x_plus" in row, "CSV must include rate_10000x_plus column"

    def test_csv_has_capped_rate(self, tmp_path):
        """CSV must include capped_rate column."""
        csv_path = tmp_path / "test_output.csv"

        stats = run_simulation(mode="base", rounds=1000, seed_str="TEST_CSV", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="TEST_CSV", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
            assert "capped_rate" in row, "CSV must include capped_rate column"

    def test_csv_has_max_win_x(self, tmp_path):
        """CSV must include max_win_x column."""
        csv_path = tmp_path / "test_output.csv"

        stats = run_simulation(mode="base", rounds=1000, seed_str="TEST_CSV", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="TEST_CSV", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
            assert "max_win_x" in row, "CSV must include max_win_x column"

    def test_csv_has_debit_multiplier(self, tmp_path):
        """CSV must include debit_multiplier column."""
        csv_path = tmp_path / "test_output.csv"

        stats = run_simulation(mode="base", rounds=1000, seed_str="TEST_CSV", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="TEST_CSV", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
            assert "debit_multiplier" in row, "CSV must include debit_multiplier column"

    def test_csv_has_avg_debit(self, tmp_path):
        """CSV must include avg_debit column."""
        csv_path = tmp_path / "test_output.csv"

        stats = run_simulation(mode="base", rounds=1000, seed_str="TEST_CSV", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="TEST_CSV", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
            assert "avg_debit" in row, "CSV must include avg_debit column"

    def test_csv_has_avg_credit(self, tmp_path):
        """CSV must include avg_credit column."""
        csv_path = tmp_path / "test_output.csv"

        stats = run_simulation(mode="base", rounds=1000, seed_str="TEST_CSV", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="TEST_CSV", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
            assert "avg_credit" in row, "CSV must include avg_credit column"

    def test_csv_has_all_required_columns(self, tmp_path):
        """CSV must include all required columns per task spec."""
        csv_path = tmp_path / "test_output.csv"

        stats = run_simulation(mode="base", rounds=1000, seed_str="TEST_CSV", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="TEST_CSV", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
            for col in REQUIRED_CSV_COLUMNS:
                assert col in row, f"CSV missing required column: {col}"


class TestBuyModeTailMeasurable:
    """Test B: buy mode 'tail is measurable' (rate_1000x_plus > 0)."""

    @pytest.fixture(scope="class")
    def buy_simulation_stats(self):
        """Run buy mode simulation for tail gate test."""
        return run_simulation(
            mode="buy",
            rounds=TAIL_GATE_ROUNDS_BUY,
            seed_str="TAIL_GATE_2025",
            verbose=False,
        )

    def test_tail_is_measurable_1000x(self, buy_simulation_stats):
        """
        Buy mode must have observable 1000x+ wins.

        Per CONFIG.md TAIL_GATE_ROUNDS_BUY, the tail distribution must be
        measurable (rate_1000x_plus > 0). If 0, write ISSUE.md explaining
        that tail is unreachable with current math.
        """
        stats = buy_simulation_stats
        rate_1000x = (stats.wins_1000x_plus / stats.rounds * 100) if stats.rounds > 0 else 0

        # This is the critical assertion - if it fails, tail is "dead"
        assert stats.wins_1000x_plus > 0, (
            f"TAIL GATE FAILED: rate_1000x_plus == 0 after {stats.rounds} buy mode rounds. "
            f"Tail distribution is unreachable with current math. "
            f"Max observed: {stats.max_win_x_observed:.2f}x. "
            f"See CONFIG.md for expected tail behavior."
        )

        # Log the rate for visibility
        print(f"\nTail Gate Buy Mode: {stats.wins_1000x_plus} wins >= 1000x ({rate_1000x:.4f}%)")

    def test_simulation_completed_expected_rounds(self, buy_simulation_stats):
        """Simulation must complete expected number of rounds."""
        stats = buy_simulation_stats
        assert stats.rounds == TAIL_GATE_ROUNDS_BUY, (
            f"Expected {TAIL_GATE_ROUNDS_BUY} rounds, got {stats.rounds}"
        )


class TestCapNeverExceeded:
    """Test C: cap never exceeded (max_win_x <= MAX_WIN_TOTAL_X)."""

    @pytest.fixture(scope="class")
    def base_simulation_stats(self):
        """Run base mode simulation."""
        return run_simulation(
            mode="base",
            rounds=20000,
            seed_str="CAP_GATE_BASE_2025",
            verbose=False,
        )

    @pytest.fixture(scope="class")
    def buy_simulation_stats(self):
        """Run buy mode simulation."""
        return run_simulation(
            mode="buy",
            rounds=10000,
            seed_str="CAP_GATE_BUY_2025",
            verbose=False,
        )

    def test_base_mode_cap_never_exceeded(self, base_simulation_stats):
        """Base mode max_win_x must not exceed MAX_WIN_TOTAL_X."""
        stats = base_simulation_stats
        assert stats.max_win_x_observed <= MAX_WIN_TOTAL_X, (
            f"CAP EXCEEDED: max_win_x {stats.max_win_x_observed}x > cap {MAX_WIN_TOTAL_X}x"
        )

    def test_buy_mode_cap_never_exceeded(self, buy_simulation_stats):
        """Buy mode max_win_x must not exceed MAX_WIN_TOTAL_X."""
        stats = buy_simulation_stats
        assert stats.max_win_x_observed <= MAX_WIN_TOTAL_X, (
            f"CAP EXCEEDED: max_win_x {stats.max_win_x_observed}x > cap {MAX_WIN_TOTAL_X}x"
        )


class TestWalletCorrectDebit:
    """Test wallet-correct debit in buy mode."""

    def test_buy_mode_debit_multiplier_is_100(self):
        """Buy mode debit multiplier must be 100x per CONFIG.md."""
        stats = run_simulation(
            mode="buy",
            rounds=100,
            seed_str="WALLET_TEST",
            verbose=False,
        )
        assert stats.debit_multiplier == 100, (
            f"Buy mode debit_multiplier must be 100, got {stats.debit_multiplier}"
        )

    def test_buy_mode_total_wagered_correct(self):
        """Buy mode total wagered must equal rounds * 100 (wallet-correct)."""
        rounds = 100
        stats = run_simulation(
            mode="buy",
            rounds=rounds,
            seed_str="WALLET_TEST",
            verbose=False,
        )
        expected_wagered = rounds * 100  # 100x bet per buy round
        assert stats.total_wagered == expected_wagered, (
            f"Buy mode wagered {stats.total_wagered} != expected {expected_wagered}"
        )

    def test_base_mode_debit_multiplier_is_1(self):
        """Base mode debit multiplier must be 1x."""
        stats = run_simulation(
            mode="base",
            rounds=100,
            seed_str="WALLET_TEST",
            verbose=False,
        )
        assert stats.debit_multiplier == 1.0, (
            f"Base mode debit_multiplier must be 1, got {stats.debit_multiplier}"
        )
