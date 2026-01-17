"""Protocol models derived from protocol_v1.md."""
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.config import settings


# === Enums from protocol_v1.md ===


class SpinMode(str, Enum):
    """Spin mode from protocol_v1.md."""

    NORMAL = "NORMAL"
    BUY_FEATURE = "BUY_FEATURE"


class GameMode(str, Enum):
    """Game mode for nextState."""

    BASE = "BASE"
    FREE_SPINS = "FREE_SPINS"


class EventType(str, Enum):
    """Event types from protocol_v1.md section 4."""

    REVEAL = "reveal"
    WIN_LINE = "winLine"
    ENTER_FREE_SPINS = "enterFreeSpins"
    HEAT_UPDATE = "heatUpdate"
    EVENT_START = "eventStart"
    EVENT_END = "eventEnd"
    SPOTLIGHT_WILDS = "spotlightWilds"
    WIN_TIER = "winTier"
    BONUS_END = "bonusEnd"


class GameEventType(str, Enum):
    """eventType values for eventStart/eventEnd."""

    BOOST = "boost"
    RAGE = "rage"
    EXPLOSIVE = "explosive"
    BONUS = "bonus"
    FINALE = "finale"


class WinTier(str, Enum):
    """Win tier from protocol_v1.md."""

    NONE = "none"
    BIG = "big"
    MEGA = "mega"
    EPIC = "epic"


class FinalePath(str, Enum):
    """Finale path from protocol_v1.md."""

    UPGRADE = "upgrade"
    MULTIPLIER = "multiplier"
    STANDARD = "standard"


# === Request Models ===


class SpinRequest(BaseModel):
    """POST /spin request body from protocol_v1.md."""

    clientRequestId: str = Field(..., description="UUIDv4 idempotency key")
    betAmount: float = Field(..., description="Must be in allowedBets")
    mode: SpinMode = Field(default=SpinMode.NORMAL)
    hypeMode: bool = Field(default=False)


# === Response Models ===


class Configuration(BaseModel):
    """Configuration object in /init response."""

    currency: str = "USD"
    allowedBets: list[float] = settings.allowed_bets
    enableBuyFeature: bool = settings.enable_buy_feature
    buyFeatureCostMultiplier: int = settings.buy_feature_cost_multiplier
    enableTurbo: bool = settings.enable_turbo
    enableHypeModeAnteBet: bool = settings.enable_hype_mode_ante_bet
    hypeModeCostIncrease: float = settings.hype_mode_cost_increase


class RestoreState(BaseModel):
    """Restore state for unfinished rounds."""

    mode: GameMode
    spinsRemaining: int
    heatLevel: int


class InitResponse(BaseModel):
    """GET /init response from protocol_v1.md."""

    protocolVersion: str = settings.protocol_version
    configuration: Configuration = Field(default_factory=Configuration)
    restoreState: RestoreState | None = None


class Context(BaseModel):
    """Context object in spin response."""

    currency: str = "USD"


class Outcome(BaseModel):
    """Outcome object in spin response."""

    totalWin: float
    totalWinX: float
    isCapped: bool = False
    capReason: str | None = None


class NextState(BaseModel):
    """Next state after spin."""

    mode: GameMode = GameMode.BASE
    spinsRemaining: int = 0
    heatLevel: int = 0


class SpinResponse(BaseModel):
    """POST /spin response from protocol_v1.md."""

    protocolVersion: str = settings.protocol_version
    roundId: str
    context: Context = Field(default_factory=Context)
    outcome: Outcome
    events: list[dict[str, Any]] = Field(default_factory=list)
    nextState: NextState = Field(default_factory=NextState)
