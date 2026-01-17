"""Error codes and exceptions derived from error_codes.md."""
from enum import Enum
from typing import Any

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import settings


class ErrorCode(str, Enum):
    """Error codes from error_codes.md."""

    INVALID_REQUEST = "INVALID_REQUEST"
    INVALID_BET = "INVALID_BET"
    FEATURE_DISABLED = "FEATURE_DISABLED"
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    ROUND_IN_PROGRESS = "ROUND_IN_PROGRESS"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    MAINTENANCE = "MAINTENANCE"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"


# HTTP status mapping from error_codes.md
ERROR_HTTP_STATUS: dict[ErrorCode, int] = {
    ErrorCode.INVALID_REQUEST: 400,
    ErrorCode.INVALID_BET: 400,
    ErrorCode.FEATURE_DISABLED: 409,
    ErrorCode.INSUFFICIENT_FUNDS: 402,
    ErrorCode.ROUND_IN_PROGRESS: 409,
    ErrorCode.IDEMPOTENCY_CONFLICT: 409,
    ErrorCode.RATE_LIMIT_EXCEEDED: 429,
    ErrorCode.MAINTENANCE: 503,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.NOT_IMPLEMENTED: 501,
}

# Recoverable flags from error_codes.md
ERROR_RECOVERABLE: dict[ErrorCode, bool] = {
    ErrorCode.INVALID_REQUEST: False,
    ErrorCode.INVALID_BET: False,
    ErrorCode.FEATURE_DISABLED: False,
    ErrorCode.INSUFFICIENT_FUNDS: True,
    ErrorCode.ROUND_IN_PROGRESS: True,
    ErrorCode.IDEMPOTENCY_CONFLICT: False,
    ErrorCode.RATE_LIMIT_EXCEEDED: True,
    ErrorCode.MAINTENANCE: True,
    ErrorCode.INTERNAL_ERROR: True,
    ErrorCode.NOT_IMPLEMENTED: False,
}


class ErrorBody(BaseModel):
    """Error body shape from protocol_v1.md."""

    code: str
    message: str
    recoverable: bool


class ErrorResponse(BaseModel):
    """Full error response from protocol_v1.md."""

    protocolVersion: str = settings.protocol_version
    error: ErrorBody


class GameError(Exception):
    """Base game error that maps to protocol error response."""

    def __init__(self, code: ErrorCode, message: str | None = None):
        self.code = code
        self.message = message or f"Error: {code.value}"
        self.status_code = ERROR_HTTP_STATUS[code]
        self.recoverable = ERROR_RECOVERABLE[code]
        super().__init__(self.message)

    def to_response(self) -> JSONResponse:
        """Convert to JSONResponse per protocol_v1.md."""
        return JSONResponse(
            status_code=self.status_code,
            content=ErrorResponse(
                error=ErrorBody(
                    code=self.code.value,
                    message=self.message,
                    recoverable=self.recoverable,
                )
            ).model_dump(),
        )


def not_implemented_response(endpoint: str) -> JSONResponse:
    """Return 501 NOT_IMPLEMENTED per error_codes.md."""
    error = GameError(
        ErrorCode.NOT_IMPLEMENTED,
        f"Endpoint {endpoint} is not yet implemented.",
    )
    return error.to_response()
