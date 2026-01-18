"""Redis Atomicity Gate tests per implementation plan.

These tests verify the double-checked locking pattern for idempotency
and the correct operation ordering under the player lock.
"""
import json
import pytest
from typing import TYPE_CHECKING
from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from conftest import RecordingMockRedis


class TestRedisAtomicityGate:
    """Gate tests for Redis atomicity guarantees."""

    def test_lock_covers_state_update_and_idempotency_write_order(
        self, client_with_recording_redis: tuple[TestClient, "RecordingMockRedis"]
    ):
        """
        Test A: Verify operation order is correct.

        Expected sequence:
        1. idempotency_get (fast path check - outside lock)
        2. lock_set_nx (acquire lock)
        3. idempotency_get (slow path re-check - inside lock)
        4. state_get (get player state)
        5. idempotency_setex (store response)
        6. state_delete OR state_setex (clear or save state)
        7. lock_delete (release lock)
        """
        client, recording_redis = client_with_recording_redis

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-order-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": "player-order-test"},
        )

        assert response.status_code == 200

        ops = recording_redis.operations

        # Find indices of key operations
        try:
            lock_acquire_idx = ops.index("lock_set_nx")
            lock_release_idx = ops.index("lock_delete")
        except ValueError as e:
            pytest.fail(f"Missing lock operation: {e}. Operations: {ops}")

        # All operations between lock acquire and release
        locked_ops = ops[lock_acquire_idx + 1:lock_release_idx]

        # Verify idempotency re-check is inside lock (slow path)
        assert "idempotency_get" in locked_ops, (
            f"Idempotency re-check must be inside lock. Locked ops: {locked_ops}"
        )

        # Verify state get is inside lock
        assert "state_get" in locked_ops, (
            f"State get must be inside lock. Locked ops: {locked_ops}"
        )

        # Verify idempotency store is inside lock
        assert "idempotency_setex" in locked_ops, (
            f"Idempotency store must be inside lock. Locked ops: {locked_ops}"
        )

        # Verify state update (delete or setex) is inside lock
        assert "state_delete" in locked_ops or "state_setex" in locked_ops, (
            f"State update must be inside lock. Locked ops: {locked_ops}"
        )

        # Verify order: idempotency_get before state_get before idempotency_setex
        idem_check_idx = locked_ops.index("idempotency_get")
        state_get_idx = locked_ops.index("state_get")
        idem_store_idx = locked_ops.index("idempotency_setex")

        assert idem_check_idx < state_get_idx, (
            f"Idempotency re-check must be before state get. Locked ops: {locked_ops}"
        )
        assert state_get_idx < idem_store_idx, (
            f"State get must be before idempotency store. Locked ops: {locked_ops}"
        )

    def test_idempotency_prevents_double_consume_in_bonus_continuation(
        self, client_with_recording_redis: tuple[TestClient, "RecordingMockRedis"]
    ):
        """
        Test B: Verify same clientRequestId returns identical response and
        does not double-decrement spinsRemaining.

        Pre-condition: Player has 10 FREE_SPINS remaining.
        Action: Two requests with same clientRequestId.
        Assert: spinsRemaining decremented exactly once (10 -> 9), both responses identical.
        """
        client, recording_redis = client_with_recording_redis

        player_id = "player-bonus-test"
        initial_spins = 10

        # Pre-seed Redis with FREE_SPINS state (GameMode, not SpinMode)
        state_key = f"state:player:{player_id}"
        recording_redis._store[state_key] = json.dumps({
            "mode": "FREE_SPINS",
            "free_spins_remaining": initial_spins,
            "heat_level": 3,
            "bonus_is_bought": False,
        })

        client_request_id = "test-double-consume-001"

        # First request
        response1 = client.post(
            "/spin",
            json={
                "clientRequestId": client_request_id,
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": player_id},
        )
        assert response1.status_code == 200
        data1 = response1.json()
        round_id_1 = data1["roundId"]
        spins_after_1 = data1["nextState"]["spinsRemaining"]

        # Clear operations to track second request
        recording_redis.operations.clear()

        # Second request with same clientRequestId (should hit cache)
        response2 = client.post(
            "/spin",
            json={
                "clientRequestId": client_request_id,
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": player_id},
        )
        assert response2.status_code == 200
        data2 = response2.json()
        round_id_2 = data2["roundId"]
        spins_after_2 = data2["nextState"]["spinsRemaining"]

        # Verify both responses are identical (same roundId proves cache hit)
        assert round_id_1 == round_id_2, (
            f"Same clientRequestId must return identical response. "
            f"roundId1={round_id_1}, roundId2={round_id_2}"
        )

        # Verify spinsRemaining is the same (not double-decremented)
        assert spins_after_1 == spins_after_2, (
            f"spinsRemaining must be identical for cached response. "
            f"first={spins_after_1}, second={spins_after_2}"
        )

        # Verify spin was decremented exactly once from initial
        assert spins_after_1 == initial_spins - 1, (
            f"Expected spinsRemaining to be {initial_spins - 1}, got {spins_after_1}"
        )

    def test_concurrent_spin_rejected_while_lock_held(
        self, client_with_mock_redis: TestClient
    ):
        """
        Test C: Verify ROUND_IN_PROGRESS when lock is already held.

        Pre-condition: Player lock already acquired.
        Action: Call spin handler.
        Assert: 409 ROUND_IN_PROGRESS error, no writes to state or idempotency.
        """
        from app.redis_service import redis_service

        client = client_with_mock_redis
        player_id = "player-lock-test"

        # Pre-acquire lock by setting the lock key directly
        lock_key = f"lock:player:{player_id}"
        redis_service._client._store[lock_key] = "1"

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-lock-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": player_id},
        )

        # Should get 409 ROUND_IN_PROGRESS
        assert response.status_code == 409, (
            f"Expected 409, got {response.status_code}: {response.json()}"
        )

        data = response.json()
        assert data["error"]["code"] == "ROUND_IN_PROGRESS", (
            f"Expected ROUND_IN_PROGRESS error, got: {data}"
        )

        # Verify no idempotency key was written
        idem_key = "idem:test-lock-001"
        assert idem_key not in redis_service._client._store, (
            "Idempotency key should not be written when lock fails"
        )

        # Verify no state key was written/modified
        state_key = f"state:player:{player_id}"
        assert state_key not in redis_service._client._store, (
            "State key should not be written when lock fails"
        )

        # Clean up lock for other tests
        del redis_service._client._store[lock_key]
