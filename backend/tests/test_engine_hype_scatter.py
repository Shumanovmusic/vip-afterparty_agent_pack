"""Test Hype Mode scatter probability per GAME_RULES.md."""
import pytest
from app.logic.engine import GameEngine
from app.logic.rng import SeededRNG
from app.protocol import SpinMode


def test_hype_mode_increases_bonus_entries():
    """
    Hype mode MUST produce more bonus entries than base mode.

    Per GAME_RULES.md: HYPE_MODE_BONUS_CHANCE_MULTIPLIER = 2.0
    With 5000 spins, we expect statistically significant difference.
    """
    seed = 12345
    rounds = 5000

    # Run base mode
    rng_base = SeededRNG(seed=seed)
    engine_base = GameEngine(rng=rng_base)
    base_bonus_entries = 0
    state = None
    for _ in range(rounds):
        result = engine_base.spin(
            bet_amount=1.0, mode=SpinMode.NORMAL, hype_mode=False, state=state
        )
        state = result.next_state
        for event in result.events:
            if event.get("type") == "enterFreeSpins":
                base_bonus_entries += 1

    # Run hype mode with SAME seed
    rng_hype = SeededRNG(seed=seed)
    engine_hype = GameEngine(rng=rng_hype)
    hype_bonus_entries = 0
    state = None
    for _ in range(rounds):
        result = engine_hype.spin(
            bet_amount=1.0, mode=SpinMode.NORMAL, hype_mode=True, state=state
        )
        state = result.next_state
        for event in result.events:
            if event.get("type") == "enterFreeSpins":
                hype_bonus_entries += 1

    # Hype MUST have strictly more bonus entries
    assert hype_bonus_entries > base_bonus_entries, (
        f"Hype mode ({hype_bonus_entries}) must have more bonus entries "
        f"than base mode ({base_bonus_entries}) per GAME_RULES.md"
    )
