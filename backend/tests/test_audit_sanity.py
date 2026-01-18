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
from scripts.audit_sim import run_simulation, calculate_percentile, BUY_FEATURE_COST_MULTIPLIER
from app.logic.engine import MAX_WIN_TOTAL_X


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
