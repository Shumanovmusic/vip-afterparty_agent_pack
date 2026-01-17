"""Request validators per protocol_v1.md and error_codes.md."""
from app.config import settings
from app.errors import ErrorCode, GameError
from app.protocol import SpinMode, SpinRequest


def validate_bet(request: SpinRequest) -> None:
    """
    Validate bet amount per protocol_v1.md.

    Raises INVALID_BET if betAmount not in allowedBets.
    """
    if request.betAmount not in settings.allowed_bets:
        raise GameError(
            ErrorCode.INVALID_BET,
            f"Bet amount {request.betAmount} not allowed. "
            f"Allowed: {settings.allowed_bets}",
        )


def validate_features(request: SpinRequest) -> None:
    """
    Validate feature flags per error_codes.md.

    Raises FEATURE_DISABLED if client requests disabled feature.
    """
    # Check BUY_FEATURE
    if request.mode == SpinMode.BUY_FEATURE and not settings.enable_buy_feature:
        raise GameError(
            ErrorCode.FEATURE_DISABLED,
            "Buy Feature is disabled.",
        )

    # Check Hype Mode
    if request.hypeMode and not settings.enable_hype_mode_ante_bet:
        raise GameError(
            ErrorCode.FEATURE_DISABLED,
            "Hype Mode is disabled.",
        )


def validate_spin_request(request: SpinRequest) -> None:
    """Run all validations on spin request."""
    validate_bet(request)
    validate_features(request)
