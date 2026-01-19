"""Crash-Safety Gate tests for idempotency replay correctness.

These tests verify that:
1. Full spin responses are stored in idempotency cache
2. Replay of same clientRequestId returns identical response
3. Write order (idempotency → state) prevents double-consume on crash
"""
import json
import pytest
from typing import TYPE_CHECKING
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

if TYPE_CHECKING:
    from conftest import RecordingMockRedis


class TestCrashSafetyGate:
    """Gate tests for crash-safety guarantees."""

    def test_replay_returns_identical_json(
        self, client_with_recording_redis: tuple[TestClient, "RecordingMockRedis"]
    ):
        """
        Test 1: Replay returns identical JSON (canonical idempotency).

        Verifies that same clientRequestId returns byte-identical response
        and that the second call does NOT invoke additional state mutation.
        """
        client, recording_redis = client_with_recording_redis

        player_id = "player-replay-test"
        client_request_id = "test-replay-001"

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

        # Record operation count after first request
        ops_after_first = len(recording_redis.operations)
        state_ops_first = [op for op in recording_redis.operations if op.startswith("state_")]

        # Clear operations to track second request
        recording_redis.operations.clear()

        # Second request with same clientRequestId
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

        # Verify byte-identical response (full JSON equality)
        assert data1 == data2, (
            f"Replay must return identical response.\n"
            f"First:  {json.dumps(data1, sort_keys=True)}\n"
            f"Second: {json.dumps(data2, sort_keys=True)}"
        )

        # Verify same roundId (proves cache hit, not recomputation)
        assert data1["roundId"] == data2["roundId"], (
            "Same roundId required - proves cached response, not recomputation"
        )

        # Verify second call did NOT mutate state (no state_setex or state_delete)
        state_ops_second = [op for op in recording_redis.operations if op.startswith("state_")]
        state_write_ops_second = [op for op in state_ops_second if op in ("state_setex", "state_delete")]
        assert len(state_write_ops_second) == 0, (
            f"Second call must not mutate state. State write ops: {state_write_ops_second}"
        )

    def test_crash_after_idempotency_write_prevents_double_consume(
        self, client_with_recording_redis: tuple[TestClient, "RecordingMockRedis"]
    ):
        """
        Test 2: Simulated crash window - idempotency written before state.

        Write order: idempotency → state
        If crash after idempotency but before state:
        - Idempotency has response (9 spins remaining in response)
        - State still has old value (10 spins)
        - Replay returns cached response (no double-consume)
        - /init may show stale state, but player doesn't lose extra spins

        This test verifies the write order protects against double-consume.
        """
        client, recording_redis = client_with_recording_redis

        player_id = "player-crash-test"
        initial_spins = 10

        # Pre-seed Redis with FREE_SPINS state
        state_key = f"state:player:{player_id}"
        recording_redis._store[state_key] = json.dumps({
            "mode": "FREE_SPINS",
            "free_spins_remaining": initial_spins,
            "heat_level": 3,
            "bonus_is_bought": False,
        })

        client_request_id = "test-crash-001"

        # First request - should succeed and consume one spin
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
        spins_after_1 = data1["nextState"]["spinsRemaining"]

        # Verify spin was consumed (9 remaining, not 10)
        assert spins_after_1 == initial_spins - 1, (
            f"Expected {initial_spins - 1} spins remaining, got {spins_after_1}"
        )

        # Simulate crash scenario: manually set state back to old value
        # (as if idempotency was written but state wasn't)
        recording_redis._store[state_key] = json.dumps({
            "mode": "FREE_SPINS",
            "free_spins_remaining": initial_spins,  # Old value, as if state wasn't updated
            "heat_level": 3,
            "bonus_is_bought": False,
        })

        # Clear operations to track second request
        recording_redis.operations.clear()

        # Second request with same clientRequestId - should return cached response
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
        spins_after_2 = data2["nextState"]["spinsRemaining"]

        # Critical assertion: replay returns cached response (9 spins, not 8)
        # This proves no double-consume even when state was "stale"
        assert spins_after_2 == initial_spins - 1, (
            f"Replay must return cached response. Expected {initial_spins - 1}, got {spins_after_2}. "
            f"If got {initial_spins - 2}, double-consume occurred!"
        )

        # Verify responses are identical
        assert data1["roundId"] == data2["roundId"], (
            "Replay must return same roundId (cache hit)"
        )

    def test_idempotency_write_inside_lock_before_state(
        self, client_with_recording_redis: tuple[TestClient, "RecordingMockRedis"]
    ):
        """
        Test 3: Lock covers idempotency write + state update ordering.

        Verifies that within the critical section:
        1. idempotency_setex occurs INSIDE the lock
        2. state_setex/state_delete occurs INSIDE the lock
        3. idempotency_setex occurs BEFORE state_setex/state_delete
        """
        client, recording_redis = client_with_recording_redis

        player_id = "player-order-test"

        # Pre-seed with FREE_SPINS state so we get state_setex (not delete)
        state_key = f"state:player:{player_id}"
        recording_redis._store[state_key] = json.dumps({
            "mode": "FREE_SPINS",
            "free_spins_remaining": 5,
            "heat_level": 3,
            "bonus_is_bought": False,
        })

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-order-crash-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": player_id},
        )

        assert response.status_code == 200

        ops = recording_redis.operations

        # Find lock boundaries
        try:
            lock_acquire_idx = ops.index("lock_set_nx")
            lock_release_idx = ops.index("lock_eval")  # Token-safe release
        except ValueError as e:
            pytest.fail(f"Missing lock operation: {e}. Operations: {ops}")

        # All operations between lock acquire and release
        locked_ops = ops[lock_acquire_idx + 1:lock_release_idx]

        # Verify idempotency_setex is inside lock
        assert "idempotency_setex" in locked_ops, (
            f"idempotency_setex must be inside lock. Locked ops: {locked_ops}"
        )

        # Verify state update is inside lock
        state_update_in_lock = "state_setex" in locked_ops or "state_delete" in locked_ops
        assert state_update_in_lock, (
            f"State update must be inside lock. Locked ops: {locked_ops}"
        )

        # Verify write order: idempotency_setex BEFORE state_setex/state_delete
        idem_idx = locked_ops.index("idempotency_setex")

        # Find first state write operation
        state_write_idx = None
        for i, op in enumerate(locked_ops):
            if op in ("state_setex", "state_delete"):
                state_write_idx = i
                break

        assert state_write_idx is not None, "State write operation not found"
        assert idem_idx < state_write_idx, (
            f"idempotency_setex must be BEFORE state write. "
            f"Idempotency at {idem_idx}, state write at {state_write_idx}. "
            f"Locked ops: {locked_ops}"
        )
