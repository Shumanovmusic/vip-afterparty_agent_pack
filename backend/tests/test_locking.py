"""Locking tests per error_codes.md."""
import asyncio
import uuid
from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.redis_service import RedisService
from tests.conftest import MockRedis


PLAYER_ID = "test-player-locking"


def make_spin_request(
    bet_amount: float = 1.00,
    mode: str = "NORMAL",
    hype_mode: bool = False,
    client_request_id: str | None = None,
) -> dict:
    """Create a valid spin request body."""
    return {
        "clientRequestId": client_request_id or str(uuid.uuid4()),
        "betAmount": bet_amount,
        "mode": mode,
        "hypeMode": hype_mode,
    }


class TestLocking:
    """Tests for per-player locking per error_codes.md."""

    def test_lock_released_after_spin(self, client_with_mock_redis: TestClient):
        """Lock must be released after spin completes, allowing next spin."""
        # First spin should succeed
        response1 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        assert response1.status_code == 200

        # Second spin should also succeed (lock released)
        response2 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        assert response2.status_code == 200

    def test_different_players_not_blocked(self, client_with_mock_redis: TestClient):
        """Different players should not block each other."""
        # Player 1 spins
        response1 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": "player-1"},
            json=make_spin_request(),
        )
        assert response1.status_code == 200

        # Player 2 spins immediately
        response2 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": "player-2"},
            json=make_spin_request(),
        )
        assert response2.status_code == 200


class TestLockingUnit:
    """Unit tests for locking behavior."""

    @pytest.mark.asyncio
    async def test_acquire_lock_succeeds_when_free(self):
        """Lock acquisition succeeds when no lock exists."""
        mock_redis = MockRedis()
        service = RedisService()
        service._client = mock_redis

        acquired = await service.acquire_player_lock("player-1")
        assert acquired is True

    @pytest.mark.asyncio
    async def test_acquire_lock_fails_when_held(self):
        """Lock acquisition fails when lock is already held."""
        mock_redis = MockRedis()
        service = RedisService()
        service._client = mock_redis

        # First acquisition succeeds
        acquired1 = await service.acquire_player_lock("player-1")
        assert acquired1 is True

        # Second acquisition fails
        acquired2 = await service.acquire_player_lock("player-1")
        assert acquired2 is False

    @pytest.mark.asyncio
    async def test_release_lock_allows_reacquisition(self):
        """After releasing lock, another can acquire it."""
        mock_redis = MockRedis()
        service = RedisService()
        service._client = mock_redis

        # Acquire
        await service.acquire_player_lock("player-1")

        # Release
        await service.release_player_lock("player-1")

        # Should be able to acquire again
        acquired = await service.acquire_player_lock("player-1")
        assert acquired is True

    @pytest.mark.asyncio
    async def test_player_lock_context_manager_releases(self):
        """Context manager releases lock even on normal exit."""
        from app.errors import GameError

        mock_redis = MockRedis()
        service = RedisService()
        service._client = mock_redis

        async with service.player_lock("player-1"):
            # Lock should be held
            pass

        # Lock should be released
        acquired = await service.acquire_player_lock("player-1")
        assert acquired is True

    @pytest.mark.asyncio
    async def test_player_lock_context_manager_releases_on_exception(self):
        """Context manager releases lock even when exception occurs."""
        mock_redis = MockRedis()
        service = RedisService()
        service._client = mock_redis

        class TestException(Exception):
            pass

        with pytest.raises(TestException):
            async with service.player_lock("player-1"):
                raise TestException("test")

        # Lock should still be released
        acquired = await service.acquire_player_lock("player-1")
        assert acquired is True

    @pytest.mark.asyncio
    async def test_player_lock_raises_round_in_progress(self):
        """Context manager raises ROUND_IN_PROGRESS when lock is held."""
        from app.errors import GameError, ErrorCode

        mock_redis = MockRedis()
        service = RedisService()
        service._client = mock_redis

        # Hold the lock
        await service.acquire_player_lock("player-1")

        # Try to acquire via context manager
        with pytest.raises(GameError) as exc_info:
            async with service.player_lock("player-1"):
                pass

        assert exc_info.value.code == ErrorCode.ROUND_IN_PROGRESS
        assert exc_info.value.status_code == 409
        assert exc_info.value.recoverable is True
