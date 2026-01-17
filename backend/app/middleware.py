"""Middleware for request validation and error handling."""
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.errors import ErrorCode, GameError


class PlayerIdMiddleware(BaseHTTPMiddleware):
    """Validate X-Player-Id header per protocol_v1.md."""

    # Paths that require X-Player-Id
    PROTECTED_PATHS = {"/init", "/spin"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.PROTECTED_PATHS:
            player_id = request.headers.get("X-Player-Id")
            if not player_id:
                error = GameError(
                    ErrorCode.INVALID_REQUEST,
                    "Missing required header: X-Player-Id",
                )
                return error.to_response()
            # Store player_id in request state for handlers
            request.state.player_id = player_id

        return await call_next(request)


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Convert GameError exceptions to protocol-compliant responses."""

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except GameError as e:
            return e.to_response()
        except Exception as e:
            # Log and return INTERNAL_ERROR
            error = GameError(ErrorCode.INTERNAL_ERROR, str(e))
            return error.to_response()
