"""Lock TTL Gate tests for crash recovery guarantees.

These tests verify that:
1. Locks always have TTL > 0 (config-driven from CONFIG.md)
2. Locks auto-expire allowing recovery from process crash
3. Lock release is token-safe (only owner can release)
"""
import pytest
from typing import TYPE_CHECKING
from fastapi.testclient import TestClient

from app.config import settings

if TYPE_CHECKING:
    from conftest import RecordingMockRedis


class TestLockTTLGate:
    """Gate tests for lock TTL crash-recovery guarantees."""

    def test_lock_has_ttl_when_acquired(
        self, client_with_recording_redis: tuple[TestClient, "RecordingMockRedis"]
    ):
        """
        Test A: Verify lock is always acquired with TTL from settings.

        Assert:
        - Lock SET includes EX parameter (TTL)
        - TTL equals settings.lock_ttl_seconds (30s from CONFIG.md)
        """
        client, recording_redis = client_with_recording_redis

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-ttl-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": "player-ttl-test"},
        )

        assert response.status_code == 200

        # Verify lock was acquired with TTL
        assert recording_redis.lock_ttl is not None, (
            "Lock must be acquired with TTL (EX parameter)"
        )
        assert recording_redis.lock_ttl > 0, (
            f"Lock TTL must be positive, got {recording_redis.lock_ttl}"
        )
        assert recording_redis.lock_ttl == settings.lock_ttl_seconds, (
            f"Lock TTL must match settings.lock_ttl_seconds ({settings.lock_ttl_seconds}), "
            f"got {recording_redis.lock_ttl}"
        )

        # Verify lock token is a UUID (not just "1")
        assert recording_redis.lock_token is not None, (
            "Lock must store a token"
        )
        assert len(recording_redis.lock_token) == 36, (
            f"Lock token should be UUID (36 chars), got: {recording_redis.lock_token}"
        )

    def test_lock_expires_allows_reacquire(
        self, client_with_recording_redis: tuple[TestClient, "RecordingMockRedis"]
    ):
        """
        Test B: Verify expired lock allows reacquisition (crash recovery).

        Simulates:
        1. Lock acquired by process A (then "crashes" - no release)
        2. Lock expires (simulated by clearing key in mock)
        3. Process B can acquire lock successfully

        This proves crash recovery works via TTL.
        """
        client, recording_redis = client_with_recording_redis
        player_id = "player-expire-test"
        lock_key = f"lock:player:{player_id}"

        # Simulate a "crashed" process that left a lock behind
        # (normally would auto-expire via TTL in real Redis)
        recording_redis._store[lock_key] = "crashed-process-token"

        # First request should fail (lock held)
        response1 = client.post(
            "/spin",
            json={
                "clientRequestId": "test-expire-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": player_id},
        )
        assert response1.status_code == 409, (
            f"Expected 409 ROUND_IN_PROGRESS, got {response1.status_code}"
        )
        assert response1.json()["error"]["code"] == "ROUND_IN_PROGRESS"

        # Simulate lock expiry (what Redis would do after LOCK_TTL seconds)
        del recording_redis._store[lock_key]

        # Second request should succeed (lock expired)
        response2 = client.post(
            "/spin",
            json={
                "clientRequestId": "test-expire-002",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": player_id},
        )
        assert response2.status_code == 200, (
            f"Expected 200 after lock expiry, got {response2.status_code}: {response2.json()}"
        )

    def test_token_safe_release_does_not_delete_other_lock(
        self, client_with_recording_redis: tuple[TestClient, "RecordingMockRedis"]
    ):
        """
        Test C: Verify token-safe release prevents deleting another's lock.

        Scenario:
        1. Process A acquires lock -> token1
        2. Process A "crashes" or is slow
        3. Lock expires, Process B acquires -> token2
        4. Process A tries to release with token1
        5. Lock must NOT be deleted (token mismatch)

        This prevents the race condition where a slow process
        accidentally releases a newer process's lock.
        """
        from app.redis_service import redis_service

        _, recording_redis = client_with_recording_redis
        player_id = "player-token-test"
        lock_key = f"lock:player:{player_id}"

        # Inject the mock into redis_service for direct method testing
        original_client = redis_service._client
        redis_service._client = recording_redis

        try:
            import asyncio

            async def run_test():
                # Process A acquires lock
                token_a = await redis_service.acquire_player_lock(player_id)
                assert token_a is not None, "Process A should acquire lock"

                # Simulate: Process A crashes, lock expires, Process B acquires
                # In real world: Redis TTL expires the key
                # In test: We manually set a new token (simulating Process B)
                token_b = "process-b-token-different"
                recording_redis._store[lock_key] = token_b

                # Process A (recovered/slow) tries to release with its old token
                released = await redis_service.release_player_lock(player_id, token_a)

                # Token-safe: release should fail (token mismatch)
                assert released is False, (
                    "Release with wrong token must return False"
                )

                # Lock should still exist with token_b
                current_value = recording_redis._store.get(lock_key)
                assert current_value == token_b, (
                    f"Lock must still hold token_b after failed release. "
                    f"Expected {token_b}, got {current_value}"
                )

                # Process B can release successfully with correct token
                released_b = await redis_service.release_player_lock(player_id, token_b)
                assert released_b is True, (
                    "Release with correct token must succeed"
                )
                assert lock_key not in recording_redis._store, (
                    "Lock should be deleted after successful release"
                )

            asyncio.get_event_loop().run_until_complete(run_test())

        finally:
            # Restore original client
            redis_service._client = original_client
