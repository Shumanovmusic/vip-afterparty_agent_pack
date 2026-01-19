"""Redis service for idempotency and locking per error_codes.md."""
import hashlib
import json
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import redis.asyncio as redis

from app.config import settings
from app.errors import ErrorCode, GameError


@dataclass
class LockMetrics:
    """Metrics from lock acquisition for telemetry."""

    acquire_ms: float
    wait_retries: int


class RedisService:
    """Redis client for idempotency cache and player locking."""

    # Key prefixes
    IDEMPOTENCY_PREFIX = "idem:"
    LOCK_PREFIX = "lock:player:"
    STATE_PREFIX = "state:player:"

    # TTLs in seconds
    IDEMPOTENCY_TTL = 3600  # 1 hour
    LOCK_TTL = settings.lock_ttl_seconds  # from CONFIG.md (30s default)
    STATE_TTL = settings.player_state_ttl_seconds  # from CONFIG.md

    # Lua script for token-safe lock release (compare-and-delete)
    # Only deletes if current value matches token; prevents releasing another's lock
    RELEASE_LOCK_SCRIPT = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
    """

    def __init__(self, redis_url: str | None = None):
        self._url = redis_url or settings.redis_url
        self._client: redis.Redis | None = None

    async def connect(self) -> None:
        """Connect to Redis."""
        if self._client is None:
            self._client = redis.from_url(self._url, decode_responses=True)

    async def close(self) -> None:
        """Close Redis connection."""
        if self._client:
            await self._client.close()
            self._client = None

    @property
    def client(self) -> redis.Redis:
        """Get Redis client, raise if not connected."""
        if self._client is None:
            raise RuntimeError("Redis not connected")
        return self._client

    def _payload_hash(self, payload: dict[str, Any]) -> str:
        """Create deterministic hash of payload for conflict detection."""
        # Sort keys to ensure deterministic ordering
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()[:16]

    async def check_idempotency(
        self, request_id: str, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        """
        Check idempotency cache.

        Returns cached response if request_id was seen before with same payload.
        Raises IDEMPOTENCY_CONFLICT if same request_id with different payload.
        Returns None if request_id not seen before.
        """
        key = f"{self.IDEMPOTENCY_PREFIX}{request_id}"
        cached = await self.client.get(key)

        if cached is None:
            return None

        data = json.loads(cached)
        stored_hash = data.get("payload_hash")
        current_hash = self._payload_hash(payload)

        if stored_hash != current_hash:
            raise GameError(
                ErrorCode.IDEMPOTENCY_CONFLICT,
                "Same clientRequestId used with different payload.",
            )

        return data.get("response")

    async def store_idempotency(
        self, request_id: str, payload: dict[str, Any], response: dict[str, Any]
    ) -> None:
        """Store response in idempotency cache."""
        key = f"{self.IDEMPOTENCY_PREFIX}{request_id}"
        data = {
            "payload_hash": self._payload_hash(payload),
            "response": response,
        }
        await self.client.setex(key, self.IDEMPOTENCY_TTL, json.dumps(data))

    async def acquire_player_lock(self, player_id: str) -> str | None:
        """
        Attempt to acquire per-player lock with unique token.

        Returns token string if lock acquired, None if already locked.
        Token is required for release (token-safe).
        """
        key = f"{self.LOCK_PREFIX}{player_id}"
        token = str(uuid.uuid4())
        # SET NX EX returns True if key was set (lock acquired)
        acquired = await self.client.set(key, token, nx=True, ex=self.LOCK_TTL)
        return token if acquired is True else None

    async def release_player_lock(self, player_id: str, token: str) -> bool:
        """
        Release per-player lock only if token matches (token-safe).

        Uses Lua script for atomic compare-and-delete.
        Returns True if lock was released, False if token didn't match.
        """
        key = f"{self.LOCK_PREFIX}{player_id}"
        result = await self.client.eval(self.RELEASE_LOCK_SCRIPT, 1, key, token)
        return result == 1

    @asynccontextmanager
    async def player_lock(self, player_id: str):
        """
        Context manager for player lock.

        Raises ROUND_IN_PROGRESS if lock cannot be acquired.
        Automatically releases lock on exit (token-safe).
        Yields LockMetrics for telemetry.
        """
        t0 = time.monotonic()
        retries = 0
        token = await self.acquire_player_lock(player_id)
        if token is None:
            raise GameError(
                ErrorCode.ROUND_IN_PROGRESS,
                "Another spin is in progress for this player.",
            )
        acquire_ms = (time.monotonic() - t0) * 1000
        metrics = LockMetrics(acquire_ms=acquire_ms, wait_retries=retries)
        try:
            yield metrics
        finally:
            await self.release_player_lock(player_id, token)

    async def get_player_state(self, player_id: str) -> dict[str, Any] | None:
        """
        Load player state from Redis.

        Returns None if no state exists (new player or state cleared).
        """
        key = f"{self.STATE_PREFIX}{player_id}"
        cached = await self.client.get(key)
        if cached is None:
            return None
        return json.loads(cached)

    async def save_player_state(self, player_id: str, state: dict[str, Any]) -> None:
        """
        Save player state to Redis with TTL.

        State structure:
        {
            "mode": "FREE_SPINS",
            "free_spins_remaining": 7,
            "heat_level": 4,
            "bonus_is_bought": true
        }
        """
        key = f"{self.STATE_PREFIX}{player_id}"
        await self.client.setex(key, self.STATE_TTL, json.dumps(state))

    async def clear_player_state(self, player_id: str) -> None:
        """Clear player state (called on bonus end or BASE mode)."""
        key = f"{self.STATE_PREFIX}{player_id}"
        await self.client.delete(key)


# Global instance
redis_service = RedisService()
