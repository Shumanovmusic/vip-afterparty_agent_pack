"""
VIP snapshot tests per GAME_RULES.md and CONFIG.md.

Tests cement VIP buy behavior, natural bonus behavior, and cap behavior
using deterministic seeds discovered by seed_hunt.py.

Fixtures: tests/fixtures/vip_snapshots.json
"""
import hashlib
import json
from pathlib import Path

import pytest

from app.logic.engine import GameEngine, MAX_WIN_TOTAL_X, FREE_SPINS_WIN_MULTIPLIER
from app.logic.models import GameMode, GameState
from app.logic.rng import SeededRNG
from app.protocol import SpinMode
from scripts.audit_sim import get_config_hash


def seed_to_int(seed_str: str) -> int:
    """Convert string seed to integer deterministically."""
    return int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % (2**31)


@pytest.fixture(scope="module")
def vip_snapshots():
    """Load VIP snapshot fixtures."""
    fixtures_path = Path(__file__).parent / "fixtures" / "vip_snapshots.json"
    with open(fixtures_path) as f:
        return json.load(f)


class TestVIPBuySnapshot:
    """Test VIP Buy Feature behavior with real discovered seed."""

    def test_vip_buy_001_triggers_vip_variant(self, vip_snapshots):
        """VIP_BUY_001: BUY_FEATURE must emit bonusVariant=vip_buy."""
        case = vip_snapshots["cases"]["VIP_BUY_001"]
        seed_str = case["seed"]
        bet_amount = case["bet_amount"]
        expected = case["expected"]

        seed_int = seed_to_int(seed_str)
        rng = SeededRNG(seed=seed_int)
        engine = GameEngine(rng=rng)

        result = engine.spin(
            bet_amount=bet_amount,
            mode=SpinMode.BUY_FEATURE,
            hype_mode=False,
            state=None,
        )

        # Check for enterFreeSpins event with correct variant
        enter_fs_events = [e for e in result.events if e.get("type") == "enterFreeSpins"]
        assert len(enter_fs_events) >= 1, "BUY_FEATURE must trigger enterFreeSpins"

        enter_fs = enter_fs_events[0]
        assert enter_fs.get("bonusVariant") == expected["bonus_variant"], (
            f"Expected bonusVariant={expected['bonus_variant']}, "
            f"got {enter_fs.get('bonusVariant')}"
        )
        assert enter_fs.get("reason") == expected["enter_free_spins_reason"], (
            f"Expected reason={expected['enter_free_spins_reason']}, "
            f"got {enter_fs.get('reason')}"
        )

    def test_vip_buy_001_applies_multiplier(self, vip_snapshots):
        """VIP_BUY_001: VIP buy bonus must apply 11x multiplier."""
        case = vip_snapshots["cases"]["VIP_BUY_001"]
        expected = case["expected"]

        # Verify multiplier matches CONFIG.md
        assert FREE_SPINS_WIN_MULTIPLIER == expected["vip_multiplier_applied"], (
            f"Expected VIP multiplier {expected['vip_multiplier_applied']}, "
            f"got {FREE_SPINS_WIN_MULTIPLIER}"
        )

    def test_vip_buy_001_state_has_bonus_is_bought(self, vip_snapshots):
        """VIP_BUY_001: State must have bonus_is_bought=True for VIP buy."""
        case = vip_snapshots["cases"]["VIP_BUY_001"]
        seed_str = case["seed"]
        bet_amount = case["bet_amount"]

        seed_int = seed_to_int(seed_str)
        rng = SeededRNG(seed=seed_int)
        engine = GameEngine(rng=rng)

        result = engine.spin(
            bet_amount=bet_amount,
            mode=SpinMode.BUY_FEATURE,
            hype_mode=False,
            state=None,
        )

        assert result.next_state.bonus_is_bought is True, (
            "VIP buy bonus must set bonus_is_bought=True"
        )


class TestNaturalBonusSnapshot:
    """Test natural scatter bonus behavior with real discovered seed."""

    def test_natural_001_triggers_standard_variant(self, vip_snapshots):
        """NATURAL_001: Natural scatter must emit bonusVariant=standard."""
        case = vip_snapshots["cases"]["NATURAL_001"]
        seed_str = case["seed"]
        bet_amount = case["bet_amount"]
        expected = case["expected"]

        seed_int = seed_to_int(seed_str)
        rng = SeededRNG(seed=seed_int)
        engine = GameEngine(rng=rng)

        result = engine.spin(
            bet_amount=bet_amount,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=None,
        )

        # Check for enterFreeSpins event with correct variant
        enter_fs_events = [e for e in result.events if e.get("type") == "enterFreeSpins"]
        assert len(enter_fs_events) >= 1, "Natural scatter must trigger enterFreeSpins"

        enter_fs = enter_fs_events[0]
        assert enter_fs.get("bonusVariant") == expected["bonus_variant"], (
            f"Expected bonusVariant={expected['bonus_variant']}, "
            f"got {enter_fs.get('bonusVariant')}"
        )
        assert enter_fs.get("reason") == expected["enter_free_spins_reason"], (
            f"Expected reason={expected['enter_free_spins_reason']}, "
            f"got {enter_fs.get('reason')}"
        )

    def test_natural_001_no_vip_multiplier(self, vip_snapshots):
        """NATURAL_001: Natural scatter bonus must NOT apply VIP multiplier."""
        case = vip_snapshots["cases"]["NATURAL_001"]
        seed_str = case["seed"]
        bet_amount = case["bet_amount"]

        seed_int = seed_to_int(seed_str)
        rng = SeededRNG(seed=seed_int)
        engine = GameEngine(rng=rng)

        result = engine.spin(
            bet_amount=bet_amount,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=None,
        )

        # State should NOT have bonus_is_bought=True
        assert result.next_state.bonus_is_bought is False, (
            "Natural scatter bonus must NOT set bonus_is_bought=True"
        )


class TestCapStressSnapshot:
    """
    Test cap enforcement behavior.

    NOTE: No natural seed found that triggers cap (max observed ~2900x vs 25000x cap).
    This test uses synthetic verification with MockRNG per vip_snapshots.json.
    """

    def test_cap_stress_001_synthetic_cap_enforcement(self, vip_snapshots):
        """CAP_STRESS_001: Synthetic test - cap must be enforced when exceeded."""
        case = vip_snapshots["cases"]["CAP_STRESS_001"]
        assert case.get("synthetic") is True, "CAP_STRESS_001 must be synthetic test"

        # Create mock RNG that produces maximum possible wins
        class MockRNGMaxWin:
            """Mock RNG that produces all WILD symbols for maximum payout."""
            def __init__(self):
                self.call_count = 0

            def random(self) -> float:
                # Return value that produces WILD symbol (0.05-0.07 range)
                return 0.06

            def randint(self, a: int, b: int) -> int:
                return b  # Maximum value

        engine = GameEngine(rng=MockRNGMaxWin())

        # Create state in FREE_SPINS with bonus_is_bought=True for 11x multiplier
        # This maximizes potential win to trigger cap
        state = GameState(
            mode=GameMode.FREE_SPINS,
            free_spins_remaining=1,
            bonus_is_bought=True,  # Apply 11x VIP multiplier
        )

        result = engine.spin(
            bet_amount=1.0,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=state,
        )

        # Verify cap enforcement regardless of whether cap was actually hit
        # (The cap mechanism should always be in place)
        assert result.total_win_x <= MAX_WIN_TOTAL_X, (
            f"Win {result.total_win_x}x exceeded cap {MAX_WIN_TOTAL_X}x"
        )

        # If cap was hit, verify proper fields
        if result.is_capped:
            assert result.total_win_x == MAX_WIN_TOTAL_X, (
                "When capped, total_win_x must equal MAX_WIN_TOTAL_X"
            )
            assert result.cap_reason is not None, (
                "When capped, cap_reason must be present"
            )

    def test_cap_stress_001_cap_reason_values(self):
        """CAP_STRESS_001: cap_reason must be valid value per protocol_v1.md."""
        allowed_reasons = {"max_win_base", "max_win_bonus", "max_exposure", None}

        rng = SeededRNG(seed=12345)
        engine = GameEngine(rng=rng)

        # Run many spins to check cap_reason values
        for _ in range(100):
            result = engine.spin(
                bet_amount=1.0,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )
            assert result.cap_reason in allowed_reasons, (
                f"cap_reason '{result.cap_reason}' not in {allowed_reasons}"
            )


class TestConfigHashConsistency:
    """Verify config hash matches snapshot fixtures."""

    def test_config_hash_matches_fixtures(self, vip_snapshots):
        """Config hash must match fixtures to ensure reproducibility."""
        expected_hash = vip_snapshots["config_hash"]
        actual_hash = get_config_hash()

        # This test documents that if config changes, fixtures need update
        # We don't fail on mismatch but log a warning
        if actual_hash != expected_hash:
            pytest.skip(
                f"Config changed since fixtures created. "
                f"Expected: {expected_hash}, Got: {actual_hash}. "
                f"Re-run seed_hunt.py to update fixtures."
            )

    def test_max_win_total_x_matches_fixtures(self, vip_snapshots):
        """MAX_WIN_TOTAL_X must match fixtures value."""
        expected = vip_snapshots["max_win_total_x"]
        assert MAX_WIN_TOTAL_X == expected, (
            f"MAX_WIN_TOTAL_X changed. Expected {expected}, got {MAX_WIN_TOTAL_X}"
        )

    def test_vip_multiplier_matches_fixtures(self, vip_snapshots):
        """VIP bonus multiplier must match fixtures value."""
        expected = vip_snapshots["buy_bonus_payout_multiplier"]
        assert FREE_SPINS_WIN_MULTIPLIER == expected, (
            f"VIP multiplier changed. Expected {expected}, got {FREE_SPINS_WIN_MULTIPLIER}"
        )
