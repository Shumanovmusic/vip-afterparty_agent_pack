"""VIP Afterparty FastAPI Application."""
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.config_hash import get_config_hash
from app.errors import ErrorCode, GameError
from app.logic.engine import GameEngine
from app.middleware import ErrorHandlerMiddleware, PlayerIdMiddleware
from app.protocol import (
    Context,
    InitResponse,
    NextState,
    Outcome,
    RestoreState,
    SpinMode,
    SpinRequest,
    SpinResponse,
    GameMode,
)
from app.logic.models import GameMode as LogicGameMode, GameState
from app.redis_service import redis_service
from app.telemetry import (
    telemetry_service,
    InitServedEvent,
    SpinProcessedEvent,
    SpinRejectedEvent,
)
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

    # Emit telemetry per TELEMETRY.md
    telemetry_service.emit_init_served(
        InitServedEvent(
            player_id=player_id,
            restore_state_present=restore_state is not None,
            restore_mode="FREE_SPINS" if restore_state else "NONE",
            spins_remaining=restore_state.spinsRemaining if restore_state else None,
        )
    )

    return response.model_dump()


def _get_telemetry_mode(body: SpinRequest) -> str:
    """
    Determine telemetry mode from spin request per TELEMETRY.md.

    Returns: "base" | "buy" | "hype"
    """
    if body.mode == SpinMode.BUY_FEATURE:
        return "buy"
    elif body.hypeMode:
        return "hype"
    return "base"


def _extract_bonus_variant(events: list[dict]) -> str | None:
    """
    Extract bonus_variant from events per TELEMETRY.md.

    Returns: "standard" | "vip_buy" | None
    """
    for event in events:
        if event.get("type") == "enterFreeSpins":
            # Check bonusVariant field first (explicit)
            if event.get("bonusVariant") == "vip_buy":
                return "vip_buy"
            # Check reason field (implicit: buy_feature = vip_buy)
            if event.get("reason") == "buy_feature":
                return "vip_buy"
            # Otherwise it's a standard scatter-triggered bonus
            return "standard"
    return None


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
    # No telemetry on replay per TELEMETRY.md
    cached = await redis_service.check_idempotency(body.clientRequestId, payload)
    if cached is not None:
        return cached

    # 4) Acquire player lock (raises ROUND_IN_PROGRESS if locked)
    # Track lock attempt timing for spin_rejected telemetry
    lock_start = time.monotonic()
    try:
        async with redis_service.player_lock(player_id) as lock_metrics:
            # 5) Re-check idempotency inside lock (slow path - correctness)
            # No telemetry on replay per TELEMETRY.md
            cached = await redis_service.check_idempotency(body.clientRequestId, payload)
            if cached is not None:
                return cached

            # 6) Load player state from Redis
            state_data = await redis_service.get_player_state(player_id)
            state = None

            # Track bonus continuation for telemetry per TELEMETRY.md
            is_bonus_continuation = False
            bonus_continuation_count = 0

            if state_data:
                state = GameState(
                    mode=LogicGameMode(state_data.get("mode", "BASE")),
                    free_spins_remaining=state_data.get("free_spins_remaining", 0),
                    heat_level=state_data.get("heat_level", 0),
                    bonus_is_bought=state_data.get("bonus_is_bought", False),
                )
                # Check if this is a bonus continuation (FREE_SPINS with spins > 0)
                if (
                    state_data.get("mode") == "FREE_SPINS"
                    and state_data.get("free_spins_remaining", 0) > 0
                ):
                    is_bonus_continuation = True
                    # Increment continuation count
                    bonus_continuation_count = state_data.get("bonus_continuation_count", 0) + 1

            # 7) Execute game logic
            result = engine.spin(
                bet_amount=body.betAmount,
                mode=body.mode,
                hype_mode=body.hypeMode,
                state=state,
            )

            # 8) Build protocol response
            round_id = str(uuid.uuid4())
            response = SpinResponse(
                roundId=round_id,
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
                # Unfinished bonus - persist state with bonusContinuationCount
                await redis_service.save_player_state(
                    player_id,
                    {
                        "mode": next_state.mode.value,
                        "free_spins_remaining": next_state.free_spins_remaining,
                        "heat_level": next_state.heat_level,
                        "bonus_is_bought": next_state.bonus_is_bought,
                        "bonus_continuation_count": bonus_continuation_count,
                    },
                )
            else:
                # Bonus ended or BASE mode - clear state (resets bonusContinuationCount)
                await redis_service.clear_player_state(player_id)

            # 11) Emit telemetry per TELEMETRY.md (only for fresh spin processing)
            telemetry_service.emit_spin_processed(
                SpinProcessedEvent(
                    player_id=player_id,
                    client_request_id=body.clientRequestId,
                    lock_acquire_ms=lock_metrics.acquire_ms,
                    lock_wait_retries=lock_metrics.wait_retries,
                    is_bonus_continuation=is_bonus_continuation,
                    bonus_continuation_count=bonus_continuation_count,
                    config_hash=get_config_hash(),
                    mode=_get_telemetry_mode(body),
                    round_id=round_id,
                    bonus_variant=_extract_bonus_variant(result.events),
                )
            )

            return response_dict

    except GameError as e:
        # Emit spin_rejected telemetry on lock failure per TELEMETRY.md
        if e.code == ErrorCode.ROUND_IN_PROGRESS:
            lock_acquire_ms = (time.monotonic() - lock_start) * 1000
            telemetry_service.emit_spin_rejected(
                SpinRejectedEvent(
                    player_id=player_id,
                    client_request_id=body.clientRequestId,
                    reason=e.code.value,
                    lock_acquire_ms=lock_acquire_ms,
                    lock_wait_retries=0,  # Current implementation is non-blocking
                )
            )
        raise
