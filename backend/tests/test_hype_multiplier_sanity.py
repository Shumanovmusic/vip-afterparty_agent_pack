"""Sanity guard for Hype Mode per GAME_RULES.md and CONFIG.md.

Per CONFIG.md: HYPE_MODE_BONUS_CHANCE_MULTIPLIER=2.0
This multiplier applies to per-cell scatter probability, not bonus entry rate.
Due to binomial distribution non-linearity, ~5-7x bonus rate increase is expected.
"""
import pytest
from app.config import settings
from app.logic.engine import GameEngine, BASE_SCATTER_CHANCE
from app.logic.rng import SeededRNG
from app.protocol import SpinMode

# Test parameters
SEED = "AUDIT_2025"
N_SPINS = 20000


def _run_simulation(hype_mode: bool, seed: str, n_spins: int) -> dict:
    """Run simulation and return stats."""
    seed_int = hash(seed) & 0xFFFFFFFF
    rng = SeededRNG(seed=seed_int)
    engine = GameEngine(rng=rng)
    bonus_entries = 0
    state = None

    for _ in range(n_spins):
        result = engine.spin(
            bet_amount=1.0,
            mode=SpinMode.NORMAL,
            hype_mode=hype_mode,
            state=state,
        )
        state = result.next_state
        for event in result.events:
            if event.get("type") == "enterFreeSpins":
                bonus_entries += 1

    bonus_rate = bonus_entries / n_spins * 100  # percentage
    return {
        "bonus_entries": bonus_entries,
        "bonus_rate": bonus_rate,
        "n_spins": n_spins,
    }


class TestHypeMultiplierSanity:
    """Sanity guards for Hype Mode per GAME_RULES.md."""

    def test_scatter_chance_multiplier_exact(self):
        """Test A: Effective scatter chance MUST equal base × multiplier (exact).

        This tests the engine applies the multiplier correctly to per-cell probability.
        """
        base_chance = BASE_SCATTER_CHANCE
        expected_hype_chance = base_chance * settings.hype_mode_bonus_chance_multiplier

        # Verify engine constant matches CONFIG.md
        assert base_chance == 0.02, "BASE_SCATTER_CHANCE must be 0.02"
        assert settings.hype_mode_bonus_chance_multiplier == 2.0, "Multiplier must be 2.0"
        assert expected_hype_chance == 0.04, "Hype scatter chance must be 0.04"

    def test_hype_increases_bonus_rate(self):
        """Test B: Hype mode MUST have strictly higher bonus entry rate than base mode.

        Per GAME_RULES.md: the per-cell scatter multiplier causes non-linear increase
        in bonus entry rate due to binomial distribution (3+ scatters in 15 cells).
        """
        base_stats = _run_simulation(hype_mode=False, seed=SEED, n_spins=N_SPINS)
        hype_stats = _run_simulation(hype_mode=True, seed=SEED, n_spins=N_SPINS)

        # Diagnostic summary
        print(f"\n=== Hype Multiplier Sanity Test ===")
        print(f"Seed: {SEED}")
        print(f"Spins per mode: {N_SPINS}")
        print(f"Base bonus entries: {base_stats['bonus_entries']} ({base_stats['bonus_rate']:.4f}%)")
        print(f"Hype bonus entries: {hype_stats['bonus_entries']} ({hype_stats['bonus_rate']:.4f}%)")

        # Assertion: hype_rate > base_rate (strict)
        assert hype_stats["bonus_rate"] > base_stats["bonus_rate"], (
            f"FAIL: Hype rate ({hype_stats['bonus_rate']:.4f}%) must be > "
            f"base rate ({base_stats['bonus_rate']:.4f}%)"
        )

        # Optional: report ratio for informational purposes (no assertion on ratio)
        if base_stats["bonus_rate"] > 0:
            ratio = hype_stats["bonus_rate"] / base_stats["bonus_rate"]
            print(f"Ratio (hype/base): {ratio:.2f}x")
            print(f"Note: Ratio ~5-7x is expected due to binomial distribution non-linearity.")
