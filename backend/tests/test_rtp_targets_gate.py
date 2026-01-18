"""
RTP Targets Gate tests per CONFIG.md.

Enforces that RTP is within target range for all modes (base, buy, hype).

Tests run audit_sim for each mode using TARGET_RTP_ROUNDS_FAST and TARGET_RTP_SEED,
then assert RTP is within [target - tolerance, target + tolerance].

Also asserts wallet correctness fields exist: avg_debit, avg_credit, debit_multiplier.

Note: Marked as @slow - requires running simulation. Skipped in quick CI.
"""
import csv

import pytest

pytestmark = pytest.mark.slow  # All tests in this module are slow

from scripts.audit_sim import generate_csv, run_simulation


# CONFIG.md values (source of truth)
TARGET_RTP_BASE = 98.0
TARGET_RTP_BUY = 98.0
# Hype mode: wager-based RTP = base_rtp / (1 + HYPE_MODE_COST_INCREASE) = 98.0 / 1.25 = 78.4
# Per GAME_RULES.md: hype payouts are on base bet, but cost is 1.25x
TARGET_RTP_HYPE = 78.4
TARGET_RTP_TOLERANCE_20K = 2.0  # ±2.0% for 20k rounds (CONFIG.md)
TARGET_RTP_ROUNDS_FAST = 20000
TARGET_RTP_SEED = "AUDIT_2025"


class TestRTPTargetsGate:
    """RTP Targets Gate: Assert RTP within tolerance for all modes."""

    @pytest.fixture(scope="class")
    def base_simulation(self, tmp_path_factory):
        """Run base mode simulation and generate CSV."""
        tmp_dir = tmp_path_factory.mktemp("rtp_gate")
        csv_path = tmp_dir / "audit_base.csv"

        stats = run_simulation(
            mode="base",
            rounds=TARGET_RTP_ROUNDS_FAST,
            seed_str=TARGET_RTP_SEED,
            verbose=False,
        )
        generate_csv(
            mode="base",
            rounds=TARGET_RTP_ROUNDS_FAST,
            seed_str=TARGET_RTP_SEED,
            stats=stats,
            output_path=str(csv_path),
        )

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
        return row, stats

    @pytest.fixture(scope="class")
    def buy_simulation(self, tmp_path_factory):
        """Run buy mode simulation and generate CSV."""
        tmp_dir = tmp_path_factory.mktemp("rtp_gate")
        csv_path = tmp_dir / "audit_buy.csv"

        stats = run_simulation(
            mode="buy",
            rounds=TARGET_RTP_ROUNDS_FAST,
            seed_str=TARGET_RTP_SEED,
            verbose=False,
        )
        generate_csv(
            mode="buy",
            rounds=TARGET_RTP_ROUNDS_FAST,
            seed_str=TARGET_RTP_SEED,
            stats=stats,
            output_path=str(csv_path),
        )

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
        return row, stats

    @pytest.fixture(scope="class")
    def hype_simulation(self, tmp_path_factory):
        """Run hype mode simulation and generate CSV."""
        tmp_dir = tmp_path_factory.mktemp("rtp_gate")
        csv_path = tmp_dir / "audit_hype.csv"

        stats = run_simulation(
            mode="hype",
            rounds=TARGET_RTP_ROUNDS_FAST,
            seed_str=TARGET_RTP_SEED,
            verbose=False,
        )
        generate_csv(
            mode="hype",
            rounds=TARGET_RTP_ROUNDS_FAST,
            seed_str=TARGET_RTP_SEED,
            stats=stats,
            output_path=str(csv_path),
        )

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
        return row, stats

    def test_base_rtp_within_tolerance(self, base_simulation):
        """Base mode RTP must be within TARGET_RTP_BASE +/- TARGET_RTP_TOLERANCE_20K."""
        row, stats = base_simulation
        rtp = float(row["rtp"])
        lower_bound = TARGET_RTP_BASE - TARGET_RTP_TOLERANCE_20K
        upper_bound = TARGET_RTP_BASE + TARGET_RTP_TOLERANCE_20K

        assert lower_bound <= rtp <= upper_bound, (
            f"BASE RTP GATE FAILED: RTP {rtp:.4f}% not in [{lower_bound}, {upper_bound}]. "
            f"Target: {TARGET_RTP_BASE}% +/- {TARGET_RTP_TOLERANCE_20K}%"
        )
        print(f"\nBase RTP: {rtp:.4f}% (target: {TARGET_RTP_BASE}% +/- {TARGET_RTP_TOLERANCE_20K}%)")

    def test_buy_rtp_within_tolerance(self, buy_simulation):
        """Buy mode RTP must be within TARGET_RTP_BUY +/- TARGET_RTP_TOLERANCE_20K."""
        row, stats = buy_simulation
        rtp = float(row["rtp"])
        lower_bound = TARGET_RTP_BUY - TARGET_RTP_TOLERANCE_20K
        upper_bound = TARGET_RTP_BUY + TARGET_RTP_TOLERANCE_20K

        assert lower_bound <= rtp <= upper_bound, (
            f"BUY RTP GATE FAILED: RTP {rtp:.4f}% not in [{lower_bound}, {upper_bound}]. "
            f"Target: {TARGET_RTP_BUY}% +/- {TARGET_RTP_TOLERANCE_20K}%"
        )
        print(f"\nBuy RTP: {rtp:.4f}% (target: {TARGET_RTP_BUY}% +/- {TARGET_RTP_TOLERANCE_20K}%)")

    def test_hype_rtp_within_tolerance(self, hype_simulation):
        """Hype mode RTP must be within TARGET_RTP_HYPE +/- TARGET_RTP_TOLERANCE_20K."""
        row, stats = hype_simulation
        rtp = float(row["rtp"])
        lower_bound = TARGET_RTP_HYPE - TARGET_RTP_TOLERANCE_20K
        upper_bound = TARGET_RTP_HYPE + TARGET_RTP_TOLERANCE_20K

        assert lower_bound <= rtp <= upper_bound, (
            f"HYPE RTP GATE FAILED: RTP {rtp:.4f}% not in [{lower_bound}, {upper_bound}]. "
            f"Target: {TARGET_RTP_HYPE}% +/- {TARGET_RTP_TOLERANCE_20K}%"
        )
        print(f"\nHype RTP: {rtp:.4f}% (target: {TARGET_RTP_HYPE}% +/- {TARGET_RTP_TOLERANCE_20K}%)")


class TestWalletCorrectnessFields:
    """Wallet correctness: CSV must include required fields."""

    def test_base_csv_has_wallet_fields(self, tmp_path):
        """Base mode CSV must include avg_debit, avg_credit, debit_multiplier."""
        csv_path = tmp_path / "test_base.csv"

        stats = run_simulation(mode="base", rounds=1000, seed_str="WALLET_TEST", verbose=False)
        generate_csv(mode="base", rounds=1000, seed_str="WALLET_TEST", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)

        assert "avg_debit" in row, "CSV must include avg_debit"
        assert "avg_credit" in row, "CSV must include avg_credit"
        assert "debit_multiplier" in row, "CSV must include debit_multiplier"

        # Base mode: debit_multiplier should be 1.0
        assert float(row["debit_multiplier"]) == 1.0, (
            f"Base mode debit_multiplier should be 1.0, got {row['debit_multiplier']}"
        )

    def test_buy_csv_has_wallet_fields(self, tmp_path):
        """Buy mode CSV must include avg_debit, avg_credit, debit_multiplier."""
        csv_path = tmp_path / "test_buy.csv"

        stats = run_simulation(mode="buy", rounds=100, seed_str="WALLET_TEST", verbose=False)
        generate_csv(mode="buy", rounds=100, seed_str="WALLET_TEST", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)

        assert "avg_debit" in row, "CSV must include avg_debit"
        assert "avg_credit" in row, "CSV must include avg_credit"
        assert "debit_multiplier" in row, "CSV must include debit_multiplier"

        # Buy mode: debit_multiplier should be 100.0
        assert float(row["debit_multiplier"]) == 100.0, (
            f"Buy mode debit_multiplier should be 100.0, got {row['debit_multiplier']}"
        )

    def test_hype_csv_has_wallet_fields(self, tmp_path):
        """Hype mode CSV must include avg_debit, avg_credit, debit_multiplier."""
        csv_path = tmp_path / "test_hype.csv"

        stats = run_simulation(mode="hype", rounds=1000, seed_str="WALLET_TEST", verbose=False)
        generate_csv(mode="hype", rounds=1000, seed_str="WALLET_TEST", stats=stats, output_path=str(csv_path))

        with open(csv_path) as f:
            reader = csv.DictReader(f)
            row = next(reader)

        assert "avg_debit" in row, "CSV must include avg_debit"
        assert "avg_credit" in row, "CSV must include avg_credit"
        assert "debit_multiplier" in row, "CSV must include debit_multiplier"

        # Hype mode: debit_multiplier should be 1.25 (1 + 0.25)
        assert float(row["debit_multiplier"]) == 1.25, (
            f"Hype mode debit_multiplier should be 1.25, got {row['debit_multiplier']}"
        )
