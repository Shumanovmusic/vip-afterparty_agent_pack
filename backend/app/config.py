"""Application configuration derived from CONFIG.md and environment."""
from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Server settings with defaults from CONFIG.md."""

    model_config = ConfigDict(env_prefix="APP_")

    # Server
    debug: bool = False
    redis_url: str = "redis://localhost:6379/0"

    # Protocol
    protocol_version: str = "1.0"

    # Game config from CONFIG.md
    max_win_total_x: int = 25000
    allowed_bets: list[float] = [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00]

    # Features
    enable_buy_feature: bool = True
    buy_feature_cost_multiplier: int = 100
    enable_turbo: bool = True
    enable_hype_mode_ante_bet: bool = True
    hype_mode_cost_increase: float = 0.25
    hype_mode_bonus_chance_multiplier: float = 2.0

    # Afterparty Meter (Canonical Rage System) - values from CONFIG.md
    enable_afterparty_meter: bool = True
    afterparty_meter_max: int = 100
    afterparty_rage_spins: int = 3
    afterparty_rage_multiplier: int = 2
    afterparty_meter_inc_on_any_win: int = 3
    afterparty_meter_inc_on_wild_present: int = 5
    afterparty_meter_inc_on_two_scatters: int = 8
    afterparty_rage_cooldown_spins: int = 15

    # State persistence (Redis TTLs) - from CONFIG.md
    player_state_ttl_seconds: int = 86400  # 24 hours for session continuation

    # Lock TTL for per-player spin lock (ROUND_IN_PROGRESS recovery) - from CONFIG.md
    lock_ttl_seconds: int = 30  # Auto-expire lock after 30s if process crashes


settings = Settings()
