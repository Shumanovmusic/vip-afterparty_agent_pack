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
    max_win_x: int = 25000
    allowed_bets: list[float] = [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00]

    # Features
    enable_buy_feature: bool = True
    buy_feature_cost_multiplier: int = 100
    enable_turbo: bool = True
    enable_hype_mode_ante_bet: bool = True
    hype_mode_cost_increase: float = 0.25


settings = Settings()
