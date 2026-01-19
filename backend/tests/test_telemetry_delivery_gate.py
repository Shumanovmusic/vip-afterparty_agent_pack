"""Telemetry Delivery & Consistency Gate tests per TELEMETRY.md.

These tests verify:
1. spin_processed contains correlation fields (config_hash, mode, round_id)
2. spin_rejected is emitted on 409 ROUND_IN_PROGRESS
3. Sink failures do not break HTTP requests
"""
import json
import pytest
from typing import TYPE_CHECKING, Any
from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from conftest import RecordingTelemetrySink, MockRedis


class FailingSink:
    """Telemetry sink that always raises an exception."""

    def emit(self, event_name: str, data: dict[str, Any]) -> None:
        """Always raise to test exception safety."""
        raise RuntimeError(f"Sink failure for {event_name}")


class TestTelemetryDeliveryGate:
    """Gate tests for telemetry delivery and consistency."""

    def test_spin_processed_contains_correlation_fields(
        self,
        client_with_recording_telemetry: tuple[TestClient, "RecordingTelemetrySink", "MockRedis"],
    ):
        """
        Test A: spin_processed contains config_hash, mode, round_id.

        Pre-condition: No player state (base mode spin).
        Action: POST /spin (NORMAL mode, hypeMode=false)
        Assert:
        - spin_processed event emitted
        - config_hash is 16-char hex string
        - mode == "base"
        - round_id matches HTTP response roundId
        """
        client, telemetry, mock_redis = client_with_recording_telemetry

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-correlation-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": "player-correlation-test"},
        )

        assert response.status_code == 200
        response_data = response.json()

        # Verify spin_processed event was emitted
        spin_events = telemetry.get_events("spin_processed")
        assert len(spin_events) == 1, f"Expected 1 spin_processed event, got {len(spin_events)}"

        event = spin_events[0]

        # Verify config_hash is 16-char hex
        assert "config_hash" in event, "spin_processed must contain config_hash"
        assert isinstance(event["config_hash"], str), "config_hash must be string"
        assert len(event["config_hash"]) == 16, f"config_hash must be 16 chars, got {len(event['config_hash'])}"
        assert all(c in "0123456789abcdef" for c in event["config_hash"]), "config_hash must be hex"

        # Verify mode is "base" (NORMAL + !hypeMode)
        assert event["mode"] == "base", f"Expected mode='base', got '{event['mode']}'"

        # Verify round_id matches HTTP response
        assert "round_id" in event, "spin_processed must contain round_id"
        assert event["round_id"] == response_data["roundId"], (
            f"round_id mismatch: telemetry={event['round_id']}, response={response_data['roundId']}"
        )

        # Verify bonus_variant is None (no bonus triggered in base spin)
        assert "bonus_variant" in event, "spin_processed must contain bonus_variant"
        # bonus_variant can be None or a string depending on whether bonus triggered

    def test_spin_processed_mode_hype(
        self,
        client_with_recording_telemetry: tuple[TestClient, "RecordingTelemetrySink", "MockRedis"],
    ):
        """
        Test A.1: spin_processed mode is "hype" when hypeMode=true.
        """
        client, telemetry, mock_redis = client_with_recording_telemetry

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-hype-mode-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": True,
            },
            headers={"X-Player-Id": "player-hype-test"},
        )

        assert response.status_code == 200

        spin_events = telemetry.get_events("spin_processed")
        assert len(spin_events) == 1

        event = spin_events[0]
        assert event["mode"] == "hype", f"Expected mode='hype', got '{event['mode']}'"

    def test_spin_processed_mode_buy(
        self,
        client_with_recording_telemetry: tuple[TestClient, "RecordingTelemetrySink", "MockRedis"],
    ):
        """
        Test A.2: spin_processed mode is "buy" when mode=BUY_FEATURE.
        """
        client, telemetry, mock_redis = client_with_recording_telemetry

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-buy-mode-001",
                "betAmount": 1.0,
                "mode": "BUY_FEATURE",
                "hypeMode": False,
            },
            headers={"X-Player-Id": "player-buy-test"},
        )

        assert response.status_code == 200

        spin_events = telemetry.get_events("spin_processed")
        assert len(spin_events) == 1

        event = spin_events[0]
        assert event["mode"] == "buy", f"Expected mode='buy', got '{event['mode']}'"

    def test_spin_rejected_emitted_on_round_in_progress(
        self,
        client_with_recording_telemetry: tuple[TestClient, "RecordingTelemetrySink", "MockRedis"],
    ):
        """
        Test B: When lock is held, second spin returns 409 and emits spin_rejected.

        Pre-condition: Manually hold player lock in Redis.
        Action: POST /spin (should fail with ROUND_IN_PROGRESS)
        Assert:
        - HTTP 409 returned
        - spin_rejected event emitted with reason=ROUND_IN_PROGRESS
        - spin_processed NOT emitted
        """
        client, telemetry, mock_redis = client_with_recording_telemetry

        player_id = "player-lock-test"

        # Manually hold the lock (simulate another spin in progress)
        lock_key = f"lock:player:{player_id}"
        mock_redis._store[lock_key] = "held-by-another"

        response = client.post(
            "/spin",
            json={
                "clientRequestId": "test-rejected-001",
                "betAmount": 1.0,
                "mode": "NORMAL",
                "hypeMode": False,
            },
            headers={"X-Player-Id": player_id},
        )

        # Verify 409 response
        assert response.status_code == 409, f"Expected 409, got {response.status_code}"
        response_data = response.json()
        assert response_data.get("error", {}).get("code") == "ROUND_IN_PROGRESS"

        # Verify spin_rejected event was emitted
        rejected_events = telemetry.get_events("spin_rejected")
        assert len(rejected_events) == 1, f"Expected 1 spin_rejected event, got {len(rejected_events)}"

        event = rejected_events[0]
        assert event["player_id"] == player_id
        assert event["client_request_id"] == "test-rejected-001"
        assert event["reason"] == "ROUND_IN_PROGRESS"
        assert isinstance(event["lock_acquire_ms"], (int, float))
        assert event["lock_acquire_ms"] >= 0
        assert event["lock_wait_retries"] == 0  # Non-blocking implementation

        # Verify spin_processed NOT emitted (request was rejected)
        spin_events = telemetry.get_events("spin_processed")
        assert len(spin_events) == 0, f"Expected 0 spin_processed events, got {len(spin_events)}"

    def test_sink_failure_does_not_break_request(
        self,
        mock_redis: "MockRedis",
    ):
        """
        Test C: Failing sink does not break /spin response.

        Pre-condition: Replace sink with FailingSink that raises on emit.
        Action: POST /spin
        Assert:
        - HTTP 200 returned (request succeeds)
        - Response contains valid roundId
        """
        from app.redis_service import redis_service
        from app.telemetry import telemetry_service

        # Setup: inject mock Redis and failing sink
        original_redis_client = redis_service._client
        original_sink = telemetry_service._sink

        redis_service._client = mock_redis
        telemetry_service.set_sink(FailingSink())

        try:
            with TestClient(app) as client:
                response = client.post(
                    "/spin",
                    json={
                        "clientRequestId": "test-sink-fail-001",
                        "betAmount": 1.0,
                        "mode": "NORMAL",
                        "hypeMode": False,
                    },
                    headers={"X-Player-Id": "player-sink-test"},
                )

                # Request must succeed despite sink failure
                assert response.status_code == 200, (
                    f"Expected 200 despite sink failure, got {response.status_code}"
                )

                response_data = response.json()
                assert "roundId" in response_data, "Response must contain roundId"
                assert isinstance(response_data["roundId"], str), "roundId must be string"
                assert len(response_data["roundId"]) > 0, "roundId must not be empty"

        finally:
            # Restore original sink and Redis
            redis_service._client = original_redis_client
            telemetry_service.set_sink(original_sink)


# Import app after fixtures are defined to avoid circular imports
from app.main import app
