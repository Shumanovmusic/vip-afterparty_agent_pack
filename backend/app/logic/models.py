"""Game state models - to be implemented."""
from pydantic import BaseModel


class GameState(BaseModel):
    """
    Placeholder for game state.

    Will track per GAME_RULES.md:
    - afterparty_meter
    - rage_active / rage_spins_left
    - heat_level
    - current mode (BASE/FREE_SPINS)
    """

    pass
