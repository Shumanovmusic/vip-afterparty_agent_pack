"""Redis service for idempotency and locking per error_codes.md."""
import hashlib
import json
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as redis

from app.config import settings
from app.errors import ErrorCode, GameError


class RedisService:
    """Redis client for idempotency cache and player locking."""

    # Key prefixes
    IDEMPOTENCY_PREFIX = "idem:"
    LOCK_PREFIX = "lock:player:"

    # TTLs in seconds
    IDEMPOTENCY_TTL = 3600  # 1 hour
    LOCK_TTL = 30  # 30 seconds max lock

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

    async def acquire_player_lock(self, player_id: str) -> bool:
        """
        Attempt to acquire per-player lock.

        Returns True if lock acquired, False if already locked.
        """
        key = f"{self.LOCK_PREFIX}{player_id}"
        # SET NX returns True if key was set (lock acquired)
        acquired = await self.client.set(key, "1", nx=True, ex=self.LOCK_TTL)
        return acquired is True

    async def release_player_lock(self, player_id: str) -> None:
        """Release per-player lock."""
        key = f"{self.LOCK_PREFIX}{player_id}"
        await self.client.delete(key)

    @asynccontextmanager
    async def player_lock(self, player_id: str):
        """
        Context manager for player lock.

        Raises ROUND_IN_PROGRESS if lock cannot be acquired.
        Automatically releases lock on exit.
        """
        if not await self.acquire_player_lock(player_id):
            raise GameError(
                ErrorCode.ROUND_IN_PROGRESS,
                "Another spin is in progress for this player.",
            )
        try:
            yield
        finally:
            await self.release_player_lock(player_id)


# Global instance
redis_service = RedisService()
