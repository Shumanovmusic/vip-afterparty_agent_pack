"""Observability Gate tests for lock + restoreState telemetry.

These tests verify that:
1. init_served event is emitted with correct restore_state fields
2. spin_processed event is emitted with lock metrics and continuation flags
3. bonus_continuation_count is tracked correctly
4. Idempotent replay does not increment bonus_continuation_count
"""
import json
import pytest
from typing import TYPE_CHECKING
from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from conftest import RecordingTelemetrySink, MockRedis


class TestObservabilityGate:
    """Gate tests for server-side observability telemetry."""

    def test_init_emits_restore_state_present_false(
        self,
        client_with_recording_telemetry: tuple[TestClient, "RecordingTelemetrySink", "MockRedis"],
    ):
        """
        Test 1: /init emits init_served with restore_state_present=false when no state.

        Pre-condition: No player state in Redis.
        Action: GET /init
        Assert:
        - init_served event emitted
        - restore_state_present == False
        - restore_mode == "NONE"
        - spins_remaining == None
        """
        client, telemetry, mock_redis = client_with_recording_telemetry

        response = client.get(
            "/init",
            headers={"X-Player-Id": "player-no-state"},
        )

        assert response.status_code == 200

        # Verify init_served event was emitted
        init_events = telemetry.get_events("init_served")
        assert len(init_events) == 1, f"Expected 1 init_served event, got {len(init_events)}"

        event = init_events[0]
        assert event["player_id"] == "player-no-state"
        assert event["restore_state_present"] is False
        assert event["restore_mode"] == "NONE"
        assert event["spins_remaining"] is None

    def test_init_emits_restore_state_present_true(
        self,
        client_with_recording_telemetry: tuple[TestClient, "RecordingTelemetrySink", "MockRedis"],
    ):
        """
        Test 2: /init emits init_served with restore_state_present=true when unfinished FREE_SPINS.

        Pre-condition: Player has FREE_SPINS state with spinsRemaining > 0.
        Action: GET /init
        Assert:
        - init_served event emitted
        - restore_state_present == True
        - restore_mode == "FREE_SPINS"
        - spins_remaining matches state
        """
        client, telemetry, mock_redis = client_with_recording_telemetry

        player_id = "player-with-state"
        spins_remaining = 7

        # Pre-seed Redis with FREE_SPINS state
        state_key = f"state:player:{player_id}"
        mock_redis._store[state_key] = json.dumps({
            "mode": "FREE_SPINS",
            "free_spins_remaining": spins_remaining,
            "heat_level": 3,
            "bonus_is_bought": False,
        })

        response = client.get(
            "/init",
            headers={"X-Player-Id": player_id},
        )

        assert response.status_code == 200

        # Verify restoreState in response
        data = response.json()
        assert data["restoreState"] is not None
        assert data["restoreState"]["spinsRemaining"] == spins_remaining

        # Verify init_served event was emitted
        init_events = telemetry.get_events("init_served")
        assert len(init_events) == 1

        event = init_events[0]
        assert event["player_id"] == player_id
        assert event["restore_state_present"] is True
        assert event["restore_mode"] == "FREE_SPINS"
        assert event["spins_remaining"] == spins_remaining

    def test_spin_emits_lock_metrics_and_continuation_flags(
        self,
        client_with_recording_telemetry: tuple[TestClient, "RecordingTelemetrySink", "MockRedis"],
    ):
        """
        Test 3: /spin emits spin_processed with lock metrics and continuation flags.

        Pre-condition: Player has FREE_SPINS state with spinsRemaining > 0.
        Action: POST /spin
        Assert:
        - spin_processed event emitted
        - lock_acquire_ms is a number >= 0
        - lock_wait_retries is 0 (immediate lock)
        - is_bonus_continuation == True
        - bonus_continuation_count == 1
        """
        client, telemetry, mock_redis = client_with_recording_telemetry

        player_id = "player-bonus-test"
        initial_spins = 5

        # Pre-seed Redis with FREE_SPINS state
        state_key = f"state:player:{player_id}"
        mock_redis._store[state_key] = json.dumps({
            "mode": "FREE_SPINS",
            "free_spins_remaining": initial_spins,
            "heat_level": 3,
            "bonus_is_bought": False,
            "bonus_continuation_count": 0,  # Starting fresh
        })

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-spin-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": player_id},
        )

        assert response.status_code == 200

        # Verify spin_processed event was emitted
        spin_events = telemetry.get_events("spin_processed")
        assert len(spin_events) == 1, f"Expected 1 spin_processed event, got {len(spin_events)}"

        event = spin_events[0]
        assert event["player_id"] == player_id
        assert event["client_request_id"] == "test-spin-001"
        assert isinstance(event["lock_acquire_ms"], (int, float))
        assert event["lock_acquire_ms"] >= 0
        assert event["lock_wait_retries"] == 0  # Immediate lock
        assert event["is_bonus_continuation"] is True
        assert event["bonus_continuation_count"] == 1

    def test_idempotent_replay_does_not_increment_bonus_continuation_count(
        self,
        client_with_recording_telemetry: tuple[TestClient, "RecordingTelemetrySink", "MockRedis"],
    ):
        """
        Test 4: Replay same clientRequestId does not emit second spin_processed.

        Pre-condition: Player has FREE_SPINS state.
        Action:
        1. POST /spin with clientRequestId = X (count becomes 1)
        2. POST /spin with same clientRequestId = X (cache hit)
        Assert:
        - Only 1 spin_processed event emitted (not 2)
        - Second call returns cached response (same roundId)
        - bonus_continuation_count not double-incremented
        """
        client, telemetry, mock_redis = client_with_recording_telemetry

        player_id = "player-replay-test"
        initial_spins = 10
        client_request_id = "test-replay-001"

        # Pre-seed Redis with FREE_SPINS state
        state_key = f"state:player:{player_id}"
        mock_redis._store[state_key] = json.dumps({
            "mode": "FREE_SPINS",
            "free_spins_remaining": initial_spins,
            "heat_level": 3,
            "bonus_is_bought": False,
            "bonus_continuation_count": 0,
        })

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

        # Verify first spin emitted telemetry
        spin_events_after_first = telemetry.get_events("spin_processed")
        assert len(spin_events_after_first) == 1
        assert spin_events_after_first[0]["bonus_continuation_count"] == 1

        # Clear telemetry to track second request
        telemetry.clear()

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

        # Verify same roundId (cache hit)
        assert data1["roundId"] == data2["roundId"], (
            "Replay must return cached response with same roundId"
        )

        # Verify NO spin_processed event on replay per TELEMETRY.md
        spin_events_after_second = telemetry.get_events("spin_processed")
        assert len(spin_events_after_second) == 0, (
            f"Expected 0 spin_processed events on replay, got {len(spin_events_after_second)}. "
            "Per TELEMETRY.md: no telemetry on idempotent replay."
        )
