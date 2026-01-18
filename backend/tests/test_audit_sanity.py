"""
Audit sanity gate test per CONFIG.md RTP targets.

This test runs a quick simulation (20k rounds) with seed AUDIT_2025
and validates that key metrics are within acceptance criteria.

Usage:
    pytest tests/test_audit_sanity.py -v

Note: Marked as @slow - requires running simulation. Skipped in quick CI.
"""
import pytest

pytestmark = pytest.mark.slow  # All tests in this module are slow
from scripts.audit_sim import (
    run_simulation,
    calculate_percentile,
    BUY_FEATURE_COST_MULTIPLIER,
)
from app.config import settings
from app.logic.engine import MAX_WIN_TOTAL_X

# Derive hype mode cost from settings (single source of truth: CONFIG.md)
HYPE_MODE_COST_INCREASE = settings.hype_mode_cost_increase


# Config targets from CONFIG.md
TARGET_RTP_BASE = 96.5
TARGET_RTP_TOLERANCE_20K = 3.0   # ±3.0% for 20k rounds (gate tests)
TARGET_RTP_TOLERANCE_100K = 2.5  # ±2.5% for 100k rounds

TARGET_BONUS_ENTRY_RATE = 0.50
TARGET_BONUS_ENTRY_TOLERANCE = 0.30  # ±0.3% -> 0.2% - 0.8%
MIN_HIT_FREQUENCY = 15.0  # Sanity check: at least 15% hit rate


class TestAuditSanity:
    """Quick audit gate test with 20k rounds."""

    @pytest.fixture(scope="class")
    def simulation_stats(self):
        """Run simulation once for all tests in this class."""
        return run_simulation(
            mode="base",
            rounds=20000,
            seed_str="AUDIT_2025",
            verbose=False,
        )

    def test_rtp_within_tolerance(self, simulation_stats):
        """RTP must be within CONFIG.md target tolerance band for 20k rounds."""
        stats = simulation_stats
        rtp = (stats.total_won / stats.total_wagered * 100) if stats.total_wagered > 0 else 0

        rtp_min = TARGET_RTP_BASE - TARGET_RTP_TOLERANCE_20K
        rtp_max = TARGET_RTP_BASE + TARGET_RTP_TOLERANCE_20K

        assert rtp >= rtp_min, f"RTP {rtp:.2f}% below minimum {rtp_min}%"
        assert rtp <= rtp_max, f"RTP {rtp:.2f}% above maximum {rtp_max}%"

    def test_bonus_entry_rate_within_tolerance(self, simulation_stats):
        """Bonus entry rate must be within CONFIG.md target tolerance band."""
        stats = simulation_stats
        bonus_rate = (stats.bonus_entries / stats.rounds * 100) if stats.rounds > 0 else 0

        rate_min = TARGET_BONUS_ENTRY_RATE - TARGET_BONUS_ENTRY_TOLERANCE
        rate_max = TARGET_BONUS_ENTRY_RATE + TARGET_BONUS_ENTRY_TOLERANCE

        assert bonus_rate >= rate_min, f"Bonus rate {bonus_rate:.2f}% below minimum {rate_min}%"
        assert bonus_rate <= rate_max, f"Bonus rate {bonus_rate:.2f}% above maximum {rate_max}%"

    def test_hit_frequency_sanity(self, simulation_stats):
        """Hit frequency must be above sanity threshold."""
        stats = simulation_stats
        hit_freq = (stats.wins / stats.rounds * 100) if stats.rounds > 0 else 0

        assert hit_freq >= MIN_HIT_FREQUENCY, f"Hit frequency {hit_freq:.2f}% below sanity minimum {MIN_HIT_FREQUENCY}%"

    def test_max_win_respects_cap(self, simulation_stats):
        """Max observed win_x must not exceed MAX_WIN_TOTAL_X cap."""
        stats = simulation_stats

        assert stats.max_win_x_observed <= MAX_WIN_TOTAL_X, (
            f"Max win_x {stats.max_win_x_observed}x exceeds cap {MAX_WIN_TOTAL_X}x"
        )

    def test_percentile_values_sane(self, simulation_stats):
        """P95 and P99 win_x values must be reasonable."""
        stats = simulation_stats

        p95 = calculate_percentile(stats.win_x_values, 95)
        p99 = calculate_percentile(stats.win_x_values, 99)

        # P99 should be greater than or equal to P95
        assert p99 >= p95, f"P99 ({p99}) should be >= P95 ({p95})"

        # Both should be non-negative
        assert p95 >= 0, f"P95 ({p95}) should be non-negative"
        assert p99 >= 0, f"P99 ({p99}) should be non-negative"

    def test_simulation_completed_expected_rounds(self, simulation_stats):
        """Simulation must complete expected number of rounds."""
        stats = simulation_stats

        assert stats.rounds == 20000, f"Expected 20000 rounds, got {stats.rounds}"

    def test_base_mode_debit_multiplier(self, simulation_stats):
        """Base mode debit multiplier should be 1x."""
        stats = simulation_stats

        assert stats.debit_multiplier == 1.0, (
            f"Base mode debit multiplier should be 1x, got {stats.debit_multiplier}x"
        )

    def test_wagered_equals_rounds_times_debit(self, simulation_stats):
        """Total wagered should equal rounds * debit_multiplier (bet=1.0 per spin)."""
        stats = simulation_stats
        expected_wagered = stats.rounds * stats.debit_multiplier

        assert stats.total_wagered == expected_wagered, (
            f"Total wagered {stats.total_wagered} != expected {expected_wagered}"
        )

    def test_tail_metrics_non_negative(self, simulation_stats):
        """Tail distribution metrics should be non-negative."""
        stats = simulation_stats

        assert stats.wins_1000x_plus >= 0, "wins_1000x_plus should be non-negative"
        assert stats.wins_10000x_plus >= 0, "wins_10000x_plus should be non-negative"
        # 10000x+ wins should be <= 1000x+ wins
        assert stats.wins_10000x_plus <= stats.wins_1000x_plus, (
            f"10000x+ wins ({stats.wins_10000x_plus}) > 1000x+ wins ({stats.wins_1000x_plus})"
        )


class TestAuditSanityBuyMode:
    """Quick audit gate test for buy mode with 10k rounds."""

    @pytest.fixture(scope="class")
    def buy_simulation_stats(self):
        """Run buy mode simulation once for all tests in this class."""
        return run_simulation(
            mode="buy",
            rounds=10000,
            seed_str="AUDIT_2025",
            verbose=False,
        )

    def test_buy_mode_completes(self, buy_simulation_stats):
        """Buy mode simulation must complete expected rounds."""
        stats = buy_simulation_stats

        assert stats.rounds == 10000, f"Expected 10000 rounds, got {stats.rounds}"

    def test_buy_mode_max_win_respects_cap(self, buy_simulation_stats):
        """Buy mode max win_x must not exceed cap."""
        stats = buy_simulation_stats

        assert stats.max_win_x_observed <= MAX_WIN_TOTAL_X, (
            f"Buy mode max win_x {stats.max_win_x_observed}x exceeds cap {MAX_WIN_TOTAL_X}x"
        )

    def test_buy_mode_debit_multiplier(self, buy_simulation_stats):
        """Buy mode debit multiplier should be 100x per CONFIG.md."""
        stats = buy_simulation_stats

        assert stats.debit_multiplier == BUY_FEATURE_COST_MULTIPLIER, (
            f"Buy mode debit multiplier should be {BUY_FEATURE_COST_MULTIPLIER}x, "
            f"got {stats.debit_multiplier}x"
        )

    def test_buy_mode_wagered_wallet_correct(self, buy_simulation_stats):
        """Buy mode total wagered should equal rounds * 100 (wallet-correct)."""
        stats = buy_simulation_stats
        expected_wagered = stats.rounds * BUY_FEATURE_COST_MULTIPLIER

        assert stats.total_wagered == expected_wagered, (
            f"Buy mode total wagered {stats.total_wagered} != expected {expected_wagered}"
        )

    def test_buy_mode_rtp_reasonable(self, buy_simulation_stats):
        """Buy mode RTP should be in reasonable range (very wide tolerance for 10k)."""
        stats = buy_simulation_stats
        rtp = (stats.total_won / stats.total_wagered * 100) if stats.total_wagered > 0 else 0

        # Very wide tolerance for 10k rounds buy mode
        # Buy mode is expensive (100x) so we expect lower RTP per wagered unit
        assert rtp > 0, f"Buy mode RTP should be positive, got {rtp:.2f}%"
        # Sanity upper bound - shouldn't exceed 200% even with variance
        assert rtp < 200, f"Buy mode RTP {rtp:.2f}% exceeds sanity maximum 200%"

    def test_buy_mode_vip_buy_bonus_tracking(self, buy_simulation_stats):
        """Buy mode should track VIP buy bonus entries per GAME_RULES.md."""
        stats = buy_simulation_stats

        # In buy mode, all bonuses should be vip_buy variant
        assert stats.vip_buy_bonus_entries == stats.bonus_entries, (
            f"In buy mode, vip_buy_bonus_entries ({stats.vip_buy_bonus_entries}) "
            f"should equal total bonus_entries ({stats.bonus_entries})"
        )

    def test_buy_mode_no_standard_bonus(self, buy_simulation_stats):
        """Buy mode should have no standard bonus entries."""
        stats = buy_simulation_stats

        assert stats.standard_bonus_entries == 0, (
            f"Buy mode should have 0 standard_bonus_entries, got {stats.standard_bonus_entries}"
        )


class TestBonusVariantTracking:
    """Tests for VIP bonus variant tracking per GAME_RULES.md."""

    @pytest.fixture(scope="class")
    def base_stats(self):
        """Run base mode simulation."""
        return run_simulation(
            mode="base",
            rounds=10000,
            seed_str="VARIANT_TEST_2025",
            verbose=False,
        )

    def test_base_mode_standard_bonus_tracking(self, base_stats):
        """Base mode should track standard bonus entries only."""
        stats = base_stats

        # In base mode, all bonuses should be standard variant
        assert stats.standard_bonus_entries == stats.bonus_entries, (
            f"In base mode, standard_bonus_entries ({stats.standard_bonus_entries}) "
            f"should equal total bonus_entries ({stats.bonus_entries})"
        )

    def test_base_mode_no_vip_buy_bonus(self, base_stats):
        """Base mode should have no VIP buy bonus entries."""
        stats = base_stats

        assert stats.vip_buy_bonus_entries == 0, (
            f"Base mode should have 0 vip_buy_bonus_entries, got {stats.vip_buy_bonus_entries}"
        )


class TestAuditCSVFields:
    """Gate C - Verify audit_sim CSV output contains required fields per GAME_RULES.md."""

    # Required CSV fields per Gate C specification
    REQUIRED_FIELDS = [
        "config_hash",
        "mode",
        "rounds",
        "seed",
        "debit_multiplier",
        "avg_debit",
        "avg_credit",
        "p95_win_x",
        "p99_win_x",
        "rate_1000x_plus",
        "rate_10000x_plus",
        "capped_rate",
        "rtp",
    ]

    @pytest.fixture(scope="class")
    def csv_output(self, tmp_path_factory):
        """Generate audit CSV and return row dict."""
        import csv
        from scripts.audit_sim import run_simulation, generate_csv

        # Run minimal simulation
        stats = run_simulation(
            mode="buy",
            rounds=1000,
            seed_str="CSV_FIELD_TEST",
            verbose=False,
        )

        # Generate CSV to temp file
        temp_dir = tmp_path_factory.mktemp("audit")
        csv_path = temp_dir / "test_audit.csv"
        generate_csv(
            mode="buy",
            rounds=1000,
            seed_str="CSV_FIELD_TEST",
            stats=stats,
            output_path=str(csv_path),
        )

        # Read back the CSV
        with open(csv_path, "r") as f:
            reader = csv.DictReader(f)
            row = next(reader)
        return row

    def test_csv_contains_all_required_fields(self, csv_output):
        """CSV output MUST contain all required fields per Gate C."""
        missing = [f for f in self.REQUIRED_FIELDS if f not in csv_output]
        assert not missing, f"CSV missing required fields: {missing}"

    def test_csv_mode_field_valid(self, csv_output):
        """CSV mode field MUST be 'base', 'buy', or 'hype'."""
        assert csv_output["mode"] in ("base", "buy", "hype"), (
            f"CSV mode field '{csv_output['mode']}' not in (base, buy, hype)"
        )

    def test_csv_config_hash_not_empty(self, csv_output):
        """CSV config_hash field MUST not be empty."""
        assert csv_output["config_hash"], "CSV config_hash is empty"
        assert len(csv_output["config_hash"]) >= 8, (
            f"CSV config_hash '{csv_output['config_hash']}' too short (min 8 chars)"
        )

    def test_csv_debit_multiplier_buy_mode(self, csv_output):
        """CSV buy mode debit_multiplier MUST be 100 per GAME_RULES.md."""
        debit_mult = float(csv_output["debit_multiplier"])
        assert debit_mult == BUY_FEATURE_COST_MULTIPLIER, (
            f"Buy mode debit_multiplier {debit_mult} != {BUY_FEATURE_COST_MULTIPLIER}"
        )

    def test_csv_avg_debit_wallet_correct(self, csv_output):
        """CSV avg_debit for buy mode MUST equal debit_multiplier (bet=1.0)."""
        avg_debit = float(csv_output["avg_debit"])
        expected = float(csv_output["debit_multiplier"])
        assert avg_debit == expected, (
            f"Buy mode avg_debit {avg_debit} != debit_multiplier {expected}"
        )

    def test_csv_percentiles_ordered(self, csv_output):
        """CSV p99 >= p95 (percentile ordering)."""
        p95 = float(csv_output["p95_win_x"])
        p99 = float(csv_output["p99_win_x"])
        assert p99 >= p95, f"p99 ({p99}) < p95 ({p95})"

    def test_csv_tail_rates_non_negative(self, csv_output):
        """CSV tail rates MUST be non-negative."""
        rate_1000x = float(csv_output["rate_1000x_plus"])
        rate_10000x = float(csv_output["rate_10000x_plus"])
        capped_rate = float(csv_output["capped_rate"])

        assert rate_1000x >= 0, f"rate_1000x_plus ({rate_1000x}) is negative"
        assert rate_10000x >= 0, f"rate_10000x_plus ({rate_10000x}) is negative"
        assert capped_rate >= 0, f"capped_rate ({capped_rate}) is negative"

    def test_csv_tail_rates_ordered(self, csv_output):
        """CSV 10000x+ rate <= 1000x+ rate (10k wins are subset of 1k wins)."""
        rate_1000x = float(csv_output["rate_1000x_plus"])
        rate_10000x = float(csv_output["rate_10000x_plus"])

        assert rate_10000x <= rate_1000x, (
            f"rate_10000x_plus ({rate_10000x}) > rate_1000x_plus ({rate_1000x})"
        )


class TestAuditSimModeSupport:
    """Gate C - Verify audit_sim.py supports required modes."""

    def test_base_mode_supported(self):
        """audit_sim MUST support base mode."""
        stats = run_simulation(
            mode="base",
            rounds=100,
            seed_str="MODE_TEST",
            verbose=False,
        )
        assert stats.rounds == 100
        assert stats.debit_multiplier == 1.0

    def test_buy_mode_supported(self):
        """audit_sim MUST support buy mode."""
        stats = run_simulation(
            mode="buy",
            rounds=100,
            seed_str="MODE_TEST",
            verbose=False,
        )
        assert stats.rounds == 100
        assert stats.debit_multiplier == BUY_FEATURE_COST_MULTIPLIER


class TestAuditHypeMode:
    """
    Gate C - Hype Mode audit tests per GAME_RULES.md.

    GAME_RULES.md Hype Mode (Ante Bet) contract:
    - Cost: Bet increases by HYPE_MODE_COST_INCREASE (25%)
    - Effect: Bonus chance multiplied by HYPE_MODE_BONUS_CHANCE_MULTIPLIER (2x)
    - Payout: Applied to base bet (not the increased bet)
    """

    @pytest.fixture(scope="class")
    def hype_stats(self):
        """Run hype mode simulation."""
        return run_simulation(
            mode="hype",
            rounds=5000,
            seed_str="AUDIT_2025",
            verbose=False,
        )

    @pytest.fixture(scope="class")
    def base_stats_for_hype_comparison(self):
        """Run base mode simulation with same seed for comparison."""
        return run_simulation(
            mode="base",
            rounds=5000,
            seed_str="AUDIT_2025",
            verbose=False,
        )

    def test_audit_supports_hype_mode(self, hype_stats, tmp_path):
        """
        Test A: audit_sim MUST support hype mode with mode='hype' in CSV.

        Verifies:
        - Simulation runs successfully for hype mode
        - CSV contains mode='hype'
        - All required fields are present
        """
        import csv
        from scripts.audit_sim import generate_csv

        stats = hype_stats
        assert stats.rounds == 5000, f"Expected 5000 rounds, got {stats.rounds}"

        # Generate CSV and verify mode field
        csv_path = tmp_path / "test_hype.csv"
        generate_csv(
            mode="hype",
            rounds=5000,
            seed_str="AUDIT_2025",
            stats=stats,
            output_path=str(csv_path),
        )

        with open(csv_path, "r") as f:
            reader = csv.DictReader(f)
            row = next(reader)

        assert row["mode"] == "hype", f"CSV mode should be 'hype', got '{row['mode']}'"
        # Verify required fields exist
        required = ["config_hash", "mode", "avg_debit", "avg_credit", "bonus_entry_rate"]
        for field in required:
            assert field in row, f"CSV missing required field: {field}"

    def test_hype_wallet_correct_debit(self, hype_stats, base_stats_for_hype_comparison):
        """
        Test B: Hype mode avg_debit MUST be > base avg_debit per GAME_RULES.md.

        Per GAME_RULES.md:
        - Cost: Bet increases by HYPE_MODE_COST_INCREASE (25%)
        - So hype debit = 1.0 * (1 + 0.25) = 1.25 vs base debit = 1.0
        """
        hype = hype_stats
        base = base_stats_for_hype_comparison

        hype_avg_debit = hype.total_wagered / hype.rounds
        base_avg_debit = base.total_wagered / base.rounds

        # Hype debit multiplier should be 1.25 (1 + 0.25)
        expected_hype_debit = 1.0 + HYPE_MODE_COST_INCREASE
        assert abs(hype.debit_multiplier - expected_hype_debit) < 0.001, (
            f"Hype debit_multiplier should be {expected_hype_debit}, got {hype.debit_multiplier}"
        )

        # Hype avg_debit > base avg_debit
        assert hype_avg_debit > base_avg_debit, (
            f"Hype avg_debit ({hype_avg_debit:.4f}) should be > base avg_debit ({base_avg_debit:.4f})"
        )

        # Verify exact ratio matches config
        expected_ratio = 1.0 + HYPE_MODE_COST_INCREASE  # 1.25
        actual_ratio = hype_avg_debit / base_avg_debit
        assert abs(actual_ratio - expected_ratio) < 0.001, (
            f"Hype/base debit ratio should be {expected_ratio}, got {actual_ratio:.4f}"
        )

    def test_hype_bonus_rate_reported(self, hype_stats, base_stats_for_hype_comparison):
        """
        Test C: Hype mode bonus_entry_rate MUST be GREATER THAN base rate per GAME_RULES.md.

        Per GAME_RULES.md:
        - Effect: Bonus chance multiplied by HYPE_MODE_BONUS_CHANCE_MULTIPLIER (2x)
        - So hype bonus_entry_rate MUST be > base bonus_entry_rate

        If this test fails with rates being equal or nearly equal, it indicates the engine
        does not implement the HYPE_MODE_BONUS_CHANCE_MULTIPLIER effect. In that case,
        create ISSUE.md pointing to GAME_RULES.md Hype Mode section and engine.py.
        """
        hype = hype_stats
        base = base_stats_for_hype_comparison

        hype_bonus_rate = hype.bonus_entries / hype.rounds if hype.rounds > 0 else 0
        base_bonus_rate = base.bonus_entries / base.rounds if base.rounds > 0 else 0

        # Bonus rate must be a valid proportion [0, 1]
        assert 0 <= hype_bonus_rate <= 1, (
            f"Hype bonus_entry_rate ({hype_bonus_rate}) not in [0, 1]"
        )

        # Per GAME_RULES.md, hype MUST increase bonus chance by 2x (HYPE_MODE_BONUS_CHANCE_MULTIPLIER)
        # With 5000 rounds and base rate ~0.5%, we expect:
        #   - base: ~25 bonus entries
        #   - hype: ~50 bonus entries (2x)
        # Minimum expected increase: at least 10% more entries than base to confirm 2x effect
        # (accounting for sampling variance in 5000 rounds)
        hype_multiplier = settings.hype_mode_bonus_chance_multiplier
        min_expected_increase_ratio = 0.1  # At least 10% increase to confirm effect is working

        if base_bonus_rate > 0:
            actual_increase_ratio = (hype_bonus_rate - base_bonus_rate) / base_bonus_rate
            assert actual_increase_ratio >= min_expected_increase_ratio, (
                f"Hype mode MUST increase bonus rate per GAME_RULES.md "
                f"(HYPE_MODE_BONUS_CHANCE_MULTIPLIER={hype_multiplier}). "
                f"Got hype_rate={hype_bonus_rate:.4f}, base_rate={base_bonus_rate:.4f}, "
                f"increase_ratio={actual_increase_ratio:.2%}. "
                f"Expected at least {min_expected_increase_ratio:.0%} increase. "
                f"ENGINE BUG: Check engine.py lines 329-331 where base_scatter_chance "
                f"is modified but never used in _generate_grid()."
            )
        else:
            # If base has 0 bonus entries, hype should have some
            assert hype_bonus_rate > 0 or base.rounds < 1000, (
                f"Neither base nor hype triggered bonus in {base.rounds} rounds - unusual"
            )
