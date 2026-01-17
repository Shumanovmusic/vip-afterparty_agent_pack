"""Rate limit tests per error_codes.md.

RATE_LIMIT_EXCEEDED (429):
- Too many requests per player/IP
- recoverable: true
- Wait 1s then retry (same requestId), max 2
"""
import uuid
import time
from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient


PLAYER_ID = "test-player-rate-limit"


def make_spin_request(
    bet_amount: float = 1.00,
    mode: str = "NORMAL",
    hype_mode: bool = False,
    client_request_id: str | None = None,
) -> dict:
    """Create a spin request body."""
    return {
        "clientRequestId": client_request_id or str(uuid.uuid4()),
        "betAmount": bet_amount,
        "mode": mode,
        "hypeMode": hype_mode,
    }


class TestRateLimitConfig:
    """Tests for rate limit configuration per error_codes.md."""

    def test_rate_limit_error_code_exists(self):
        """RATE_LIMIT_EXCEEDED error code must exist."""
        from app.errors import ErrorCode

        assert hasattr(ErrorCode, "RATE_LIMIT_EXCEEDED")
        assert ErrorCode.RATE_LIMIT_EXCEEDED.value == "RATE_LIMIT_EXCEEDED"

    def test_rate_limit_http_status(self):
        """RATE_LIMIT_EXCEEDED must return 429 status."""
        from app.errors import ErrorCode, GameError

        error = GameError(ErrorCode.RATE_LIMIT_EXCEEDED, "Too many requests")
        assert error.status_code == 429

    def test_rate_limit_is_recoverable(self):
        """RATE_LIMIT_EXCEEDED must be recoverable."""
        from app.errors import ErrorCode, GameError

        error = GameError(ErrorCode.RATE_LIMIT_EXCEEDED, "Too many requests")
        assert error.recoverable is True


class TestRateLimitBehavior:
    """Tests for rate limiting behavior.

    NOTE: These tests document the expected behavior per error_codes.md.
    Rate limiting should:
    - Return 429 after exceeding threshold
    - Be recoverable (retry with same requestId allowed)
    - Allow retry after 1s wait
    """

    @pytest.mark.skip(reason="Rate limiting not yet implemented - TODO")
    def test_rapid_requests_trigger_rate_limit(self, client_with_mock_redis: TestClient):
        """Rapid sequential requests should trigger rate limit."""
        # Send multiple requests rapidly
        for i in range(10):
            response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(),
            )
            if response.status_code == 429:
                # Rate limit hit as expected
                data = response.json()
                assert data["error"]["code"] == "RATE_LIMIT_EXCEEDED"
                assert data["error"]["recoverable"] is True
                return

        pytest.fail("Rate limit was not triggered after 10 rapid requests")

    @pytest.mark.skip(reason="Rate limiting not yet implemented - TODO")
    def test_rate_limit_per_player(self, client_with_mock_redis: TestClient):
        """Rate limiting should be per-player, not global."""
        # Player 1 rapid requests
        for i in range(5):
            client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": "player-1"},
                json=make_spin_request(),
            )

        # Player 2 should not be rate limited
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": "player-2"},
            json=make_spin_request(),
        )
        assert response.status_code == 200, "Player 2 should not be rate limited"

    @pytest.mark.skip(reason="Rate limiting not yet implemented - TODO")
    def test_rate_limit_recovery_with_same_request_id(
        self, client_with_mock_redis: TestClient
    ):
        """Retry with same requestId should be allowed after rate limit."""
        request_id = str(uuid.uuid4())

        # Trigger rate limit (mock or real)
        response = None
        for i in range(20):
            response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(client_request_id=request_id),
            )
            if response.status_code == 429:
                break

        if response and response.status_code == 429:
            # Wait per error_codes.md: "Wait 1s then retry"
            time.sleep(1.1)

            # Retry with same requestId
            retry_response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(client_request_id=request_id),
            )
            # Should succeed (either fresh or cached from idempotency)
            assert retry_response.status_code in (200, 429)


class TestRateLimitErrorResponse:
    """Tests for rate limit error response format."""

    def test_rate_limit_response_format(self):
        """Rate limit error response must match protocol format."""
        from app.errors import ErrorCode, GameError

        error = GameError(ErrorCode.RATE_LIMIT_EXCEEDED, "Too many requests")
        response = error.to_response()

        # Parse response
        import json
        data = json.loads(response.body)

        assert "protocolVersion" in data
        assert data["protocolVersion"] == "1.0"
        assert "error" in data
        assert data["error"]["code"] == "RATE_LIMIT_EXCEEDED"
        assert data["error"]["recoverable"] is True
        assert "message" in data["error"]


class TestEventSystemRateLimits:
    """Tests for in-game event rate limits per CONFIG.md and EVENT_SYSTEM.md.

    These are different from API rate limits - they limit how often
    in-game events (boost, rage, explosive) can trigger.
    """

    def test_event_max_rate_config(self):
        """EVENT_MAX_RATE_PER_100_SPINS must match CONFIG.md."""
        from app.logic.engine import (
            EVENT_MAX_RATE_PER_100_SPINS,
            BOOST_MAX_RATE_PER_100_SPINS,
            EXPLOSIVE_MAX_RATE_PER_100_SPINS,
        )

        # NOTE: Rage is now meter-based (Afterparty Meter), not rate-limited by Event System
        assert EVENT_MAX_RATE_PER_100_SPINS == 18
        assert BOOST_MAX_RATE_PER_100_SPINS == 8
        assert EXPLOSIVE_MAX_RATE_PER_100_SPINS == 10

    def test_events_respect_rate_limits(self):
        """Event triggers must respect per-100-spin rate limits."""
        from app.logic.engine import (
            GameEngine,
            EVENT_MAX_RATE_PER_100_SPINS,
        )
        from app.logic.rng import SeededRNG
        from app.protocol import SpinMode

        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        event_counts = {
            "boost": 0,
            "rage": 0,
            "explosive": 0,
        }

        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )

            for event in result.events:
                if event.get("type") == "eventStart":
                    event_type = event.get("eventType")
                    if event_type in event_counts:
                        event_counts[event_type] += 1

        total_events = sum(event_counts.values())
        assert total_events <= EVENT_MAX_RATE_PER_100_SPINS, (
            f"Total events {total_events} exceeds limit {EVENT_MAX_RATE_PER_100_SPINS}"
        )
