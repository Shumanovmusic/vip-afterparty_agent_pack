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
    RestoreState,
    SpinRequest,
    SpinResponse,
    GameMode,
)
from app.logic.models import GameMode as LogicGameMode, GameState
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
    player_id = request.state.player_id

    # Load state from Redis
    state_data = await redis_service.get_player_state(player_id)

    restore_state = None
    if state_data and state_data.get("mode") == "FREE_SPINS":
        if state_data.get("free_spins_remaining", 0) > 0:
            restore_state = RestoreState(
                mode=GameMode.FREE_SPINS,
                spinsRemaining=state_data["free_spins_remaining"],
                heatLevel=state_data.get("heat_level", 0),
            )

    response = InitResponse(restoreState=restore_state)
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

    # 3) Check idempotency cache (fast path - optimization)
    cached = await redis_service.check_idempotency(body.clientRequestId, payload)
    if cached is not None:
        return cached

    # 4) Acquire player lock (raises ROUND_IN_PROGRESS if locked)
    async with redis_service.player_lock(player_id):
        # 5) Re-check idempotency inside lock (slow path - correctness)
        # This prevents race condition where two requests with same clientRequestId
        # both pass the fast path check before either stores the result
        cached = await redis_service.check_idempotency(body.clientRequestId, payload)
        if cached is not None:
            return cached

        # 6) Load player state from Redis
        state_data = await redis_service.get_player_state(player_id)
        state = None
        if state_data:
            state = GameState(
                mode=LogicGameMode(state_data.get("mode", "BASE")),
                free_spins_remaining=state_data.get("free_spins_remaining", 0),
                heat_level=state_data.get("heat_level", 0),
                bonus_is_bought=state_data.get("bonus_is_bought", False),
            )

        # 7) Execute game logic
        result = engine.spin(
            bet_amount=body.betAmount,
            mode=body.mode,
            hype_mode=body.hypeMode,
            state=state,
        )

        # 8) Build protocol response
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

        # 9) Store in idempotency cache
        await redis_service.store_idempotency(
            body.clientRequestId, payload, response_dict
        )

        # 10) Save player state to Redis
        next_state = result.next_state
        if (
            next_state.mode == LogicGameMode.FREE_SPINS
            and next_state.free_spins_remaining > 0
        ):
            # Unfinished bonus - persist state
            await redis_service.save_player_state(
                player_id,
                {
                    "mode": next_state.mode.value,
                    "free_spins_remaining": next_state.free_spins_remaining,
                    "heat_level": next_state.heat_level,
                    "bonus_is_bought": next_state.bonus_is_bought,
                },
            )
        else:
            # Bonus ended or BASE mode - clear state
            await redis_service.clear_player_state(player_id)

        return response_dict
