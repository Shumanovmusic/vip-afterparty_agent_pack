"""VIP Afterparty FastAPI Application."""
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.errors import GameError
from app.logic.engine import GameEngine
from app.middleware import ErrorHandlerMiddleware, PlayerIdMiddleware
from app.protocol import (
    Context,
    InitResponse,
    NextState,
    Outcome,
    SpinRequest,
    SpinResponse,
    GameMode,
)
from app.redis_service import redis_service
from app.validators import validate_spin_request


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage Redis connection lifecycle."""
    await redis_service.connect()
    yield
    await redis_service.close()


app = FastAPI(
    title="VIP Afterparty RGS",
    version="0.1.0",
    description="Remote Game Server for VIP Afterparty slot game",
    lifespan=lifespan,
)

# Add middleware per protocol_v1.md
app.add_middleware(ErrorHandlerMiddleware)
app.add_middleware(PlayerIdMiddleware)

# Game engine instance
engine = GameEngine()


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/init")
async def init(request: Request) -> dict:
    """
    GET /init per protocol_v1.md.

    Returns configuration and optionally restore state.
    """
    # TODO: Implement restoreState lookup from Redis for unfinished rounds
    response = InitResponse()
    return response.model_dump()


@app.post("/spin")
async def spin(request: Request, body: SpinRequest) -> dict:
    """
    POST /spin per protocol_v1.md.

    Implements:
    - Request validation
    - Idempotency (same clientRequestId returns cached response)
    - Per-player locking (ROUND_IN_PROGRESS on concurrent spin)
    - Game engine execution
    - Response per protocol schema
    """
    player_id = request.state.player_id

    # 1) Validate request
    validate_spin_request(body)

    # 2) Build payload for idempotency check
    payload = {
        "betAmount": body.betAmount,
        "mode": body.mode.value,
        "hypeMode": body.hypeMode,
    }

    # 3) Check idempotency cache
    cached = await redis_service.check_idempotency(body.clientRequestId, payload)
    if cached is not None:
        return cached

    # 4) Acquire player lock (raises ROUND_IN_PROGRESS if locked)
    async with redis_service.player_lock(player_id):
        # 5) Execute game logic
        # TODO: Load player state from Redis
        result = engine.spin(
            bet_amount=body.betAmount,
            mode=body.mode,
            hype_mode=body.hypeMode,
            state=None,  # New state for now
        )

        # 6) Build protocol response
        response = SpinResponse(
            roundId=str(uuid.uuid4()),
            context=Context(),
            outcome=Outcome(
                totalWin=result.total_win,
                totalWinX=result.total_win_x,
                isCapped=result.is_capped,
                capReason=result.cap_reason,
            ),
            events=result.events,
            nextState=NextState(
                mode=GameMode(result.next_state.mode.value),
                spinsRemaining=result.next_state.free_spins_remaining,
                heatLevel=result.next_state.heat_level,
            ),
        )

        response_dict = response.model_dump()

        # 7) Store in idempotency cache
        await redis_service.store_idempotency(
            body.clientRequestId, payload, response_dict
        )

        # TODO: Save player state to Redis

        return response_dict
