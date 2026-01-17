"""Game state models per GAME_RULES.md and TELEMETRY.md."""
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Symbol(int, Enum):
    """Slot symbols - placeholder values."""
    WILD = 0
    SCATTER = 1
    HIGH1 = 2
    HIGH2 = 3
    HIGH3 = 4
    MID1 = 5
    MID2 = 6
    LOW1 = 7
    LOW2 = 8
    LOW3 = 9


class GameMode(str, Enum):
    """Current game mode."""
    BASE = "BASE"
    FREE_SPINS = "FREE_SPINS"


class GameState(BaseModel):
    """
    Player game state per GAME_RULES.md.

    Tracks:
    - afterparty_meter (0..RAGE_METER_MAX)
    - rage_active / rage_spins_left
    - heat_level (in free spins)
    - current mode (BASE/FREE_SPINS)
    - free spins remaining
    - deadspins_streak / smallwins_streak for events
    """
    mode: GameMode = GameMode.BASE

    # Free spins state
    free_spins_remaining: int = 0
    heat_level: int = 0

    # Afterparty meter for Rage Mode (per GAME_RULES.md)
    afterparty_meter: int = 0

    # Rage mode state
    rage_active: bool = False
    rage_spins_left: int = 0
    rage_deferred: bool = False  # Deferred due to bonus

    # Event counters per EVENT_SYSTEM.md
    deadspins_streak: int = 0
    smallwins_streak: int = 0

    # Rate limiting counters (rolling window)
    spins_in_window: int = 0
    events_in_window: int = 0
    boost_in_window: int = 0
    rage_in_window: int = 0
    explosive_in_window: int = 0
    rage_cooldown_remaining: int = 0

    def reset_for_new_session(self) -> None:
        """Reset state for new session."""
        self.mode = GameMode.BASE
        self.free_spins_remaining = 0
        self.heat_level = 0
        self.afterparty_meter = 0
        self.rage_active = False
        self.rage_spins_left = 0
        self.rage_deferred = False
        self.deadspins_streak = 0
        self.smallwins_streak = 0
        self.spins_in_window = 0
        self.events_in_window = 0
        self.boost_in_window = 0
        self.rage_in_window = 0
        self.explosive_in_window = 0
        self.rage_cooldown_remaining = 0


class SpinResult(BaseModel):
    """Result of a spin computation."""
    grid: list[list[int]] = Field(default_factory=list)  # 5x3 grid
    base_win: float = 0.0
    total_win: float = 0.0
    total_win_x: float = 0.0
    is_capped: bool = False
    cap_reason: str | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)
    next_state: GameState = Field(default_factory=GameState)

    # Telemetry fields
    spotlight_used: bool = False
    spotlight_positions: list[int] = Field(default_factory=list)
    scatter_count: int = 0
    wild_count: int = 0
    win_tier: str = "none"
