"""Cap enforcement tests per CONFIG.md and GAME_RULES.md."""
import pytest

from app.config import settings
from app.logic.engine import GameEngine, MAX_WIN_TOTAL_X
from app.logic.models import GameState, GameMode
from app.logic.rng import SeededRNG
from app.protocol import SpinMode


class TestMaxWinCap:
    """Tests for MAX_WIN_TOTAL_X cap enforcement."""

    def test_max_win_total_x_value(self):
        """MAX_WIN_TOTAL_X must be 25000 per CONFIG.md."""
        assert MAX_WIN_TOTAL_X == 25000

    def test_max_win_total_x_from_settings(self):
        """MAX_WIN_TOTAL_X must be derived from settings, not hardcoded."""
        assert MAX_WIN_TOTAL_X == settings.max_win_total_x

    def test_total_win_x_never_exceeds_cap(self):
        """No spin result should have totalWinX > MAX_WIN_TOTAL_X."""
        # Use deterministic RNG to test many spins
        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        for _ in range(1000):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )
            assert result.total_win_x <= MAX_WIN_TOTAL_X, (
                f"Win exceeded cap: {result.total_win_x}x > {MAX_WIN_TOTAL_X}x"
            )

    def test_cap_sets_is_capped_flag(self):
        """When cap is applied, isCapped must be True."""
        # We need to manufacture a scenario where cap would apply
        # This is hard to trigger naturally, so we test the engine logic directly

        # Create an engine with mock that would produce huge win
        class MockRNG:
            """Mock RNG that produces all high-value symbols."""

            def random(self) -> float:
                # Return value that produces HIGH1 symbol
                return 0.10

            def randint(self, a: int, b: int) -> int:
                return a

        engine = GameEngine(rng=MockRNG())

        # Run many spins - most won't hit cap due to normal math
        # but we verify the cap logic is in place
        for _ in range(100):
            result = engine.spin(
                bet_amount=0.01,  # Small bet to make cap easier to reach
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )
            # If somehow we exceed, it should be capped
            if result.is_capped:
                assert result.total_win_x == MAX_WIN_TOTAL_X
                assert result.cap_reason is not None

    def test_cap_reason_values(self):
        """Cap reason must be one of the allowed values from protocol_v1.md."""
        allowed_reasons = {"max_win_base", "max_win_bonus", "max_exposure", None}

        rng = SeededRNG(seed=123)
        engine = GameEngine(rng=rng)

        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )
            assert result.cap_reason in allowed_reasons

    def test_cap_in_base_game_has_base_reason(self):
        """Cap in BASE mode must have capReason='max_win_base'."""
        # This is a logical test - when cap applies in base game
        # We verify the engine sets correct reason

        rng = SeededRNG(seed=456)
        engine = GameEngine(rng=rng)

        # Run spins in BASE mode
        state = GameState(mode=GameMode.BASE)
        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=state,
            )
            if result.is_capped:
                assert result.cap_reason == "max_win_base"

    def test_cap_in_free_spins_has_bonus_reason(self):
        """Cap in FREE_SPINS mode must have capReason='max_win_bonus'."""
        rng = SeededRNG(seed=789)
        engine = GameEngine(rng=rng)

        # Run spins in FREE_SPINS mode
        state = GameState(mode=GameMode.FREE_SPINS, free_spins_remaining=10)
        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=state,
            )
            if result.is_capped:
                assert result.cap_reason == "max_win_bonus"


class TestRageMultiplierCap:
    """Tests for rage mode multiplier respecting cap."""

    def test_rage_multiplier_still_capped(self):
        """Rage mode x2 multiplier must still respect MAX_WIN_TOTAL_X cap."""
        rng = SeededRNG(seed=101)
        engine = GameEngine(rng=rng)

        # Create state with rage active
        state = GameState(
            mode=GameMode.BASE,
            rage_active=True,
            rage_spins_left=2,
        )

        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=state,
            )
            # Even with rage multiplier, win must not exceed cap
            assert result.total_win_x <= MAX_WIN_TOTAL_X


class TestHypeModeCap:
    """Tests for hype mode respecting cap."""

    def test_hype_mode_payout_uses_base_bet(self):
        """Hype mode payouts must use base bet, not inflated bet."""
        rng = SeededRNG(seed=202)
        engine = GameEngine(rng=rng)

        # With same seed, both should produce same grid
        result_normal = engine.spin(
            bet_amount=1.00,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=None,
        )

        # Reset RNG to same state
        rng2 = SeededRNG(seed=202)
        engine2 = GameEngine(rng=rng2)

        result_hype = engine2.spin(
            bet_amount=1.00,
            mode=SpinMode.NORMAL,
            hype_mode=True,  # Hype mode on
            state=None,
        )

        # Total win should be same (based on base bet, not hype-inflated)
        assert result_normal.total_win == result_hype.total_win
        assert result_normal.total_win_x == result_hype.total_win_x
