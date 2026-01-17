"""Idempotency tests per error_codes.md."""
import uuid

import pytest
from fastapi.testclient import TestClient


PLAYER_ID = "test-player-idempotency"


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


class TestIdempotency:
    """Tests for idempotency behavior per error_codes.md."""

    def test_same_request_id_returns_identical_response(
        self, client_with_mock_redis: TestClient
    ):
        """Same clientRequestId must return identical cached response."""
        request_id = str(uuid.uuid4())
        request_body = make_spin_request(client_request_id=request_id)

        # First request
        response1 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=request_body,
        )
        assert response1.status_code == 200
        data1 = response1.json()

        # Second request with same requestId
        response2 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=request_body,
        )
        assert response2.status_code == 200
        data2 = response2.json()

        # Must be identical (same roundId, outcome, events)
        assert data1["roundId"] == data2["roundId"]
        assert data1["outcome"] == data2["outcome"]
        assert data1["events"] == data2["events"]
        assert data1["nextState"] == data2["nextState"]

    def test_same_request_id_same_payload_multiple_times(
        self, client_with_mock_redis: TestClient
    ):
        """Multiple requests with same ID and payload return same response."""
        request_id = str(uuid.uuid4())
        request_body = make_spin_request(client_request_id=request_id)

        responses = []
        for _ in range(5):
            response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=request_body,
            )
            assert response.status_code == 200
            responses.append(response.json())

        # All must have same roundId
        round_ids = {r["roundId"] for r in responses}
        assert len(round_ids) == 1

    def test_different_payload_same_id_returns_conflict(
        self, client_with_mock_redis: TestClient
    ):
        """Same clientRequestId with different payload must return IDEMPOTENCY_CONFLICT (409)."""
        request_id = str(uuid.uuid4())

        # First request
        response1 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(
                client_request_id=request_id,
                bet_amount=1.00,  # Original bet
            ),
        )
        assert response1.status_code == 200

        # Second request with same ID but different bet
        response2 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(
                client_request_id=request_id,
                bet_amount=2.00,  # Different bet
            ),
        )
        assert response2.status_code == 409
        data = response2.json()
        assert data["error"]["code"] == "IDEMPOTENCY_CONFLICT"
        assert data["error"]["recoverable"] is False

    def test_different_mode_same_id_returns_conflict(
        self, client_with_mock_redis: TestClient
    ):
        """Same clientRequestId with different mode must return IDEMPOTENCY_CONFLICT."""
        request_id = str(uuid.uuid4())

        # First request with NORMAL mode
        response1 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(
                client_request_id=request_id,
                mode="NORMAL",
            ),
        )
        assert response1.status_code == 200

        # Second request with BUY_FEATURE mode
        response2 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(
                client_request_id=request_id,
                mode="BUY_FEATURE",
            ),
        )
        assert response2.status_code == 409
        data = response2.json()
        assert data["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    def test_different_hype_mode_same_id_returns_conflict(
        self, client_with_mock_redis: TestClient
    ):
        """Same clientRequestId with different hypeMode must return IDEMPOTENCY_CONFLICT."""
        request_id = str(uuid.uuid4())

        # First request without hype mode
        response1 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(
                client_request_id=request_id,
                hype_mode=False,
            ),
        )
        assert response1.status_code == 200

        # Second request with hype mode
        response2 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(
                client_request_id=request_id,
                hype_mode=True,
            ),
        )
        assert response2.status_code == 409
        data = response2.json()
        assert data["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    def test_different_request_ids_generate_different_rounds(
        self, client_with_mock_redis: TestClient
    ):
        """Different clientRequestIds must generate different roundIds."""
        request1 = make_spin_request(client_request_id=str(uuid.uuid4()))
        request2 = make_spin_request(client_request_id=str(uuid.uuid4()))

        response1 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=request1,
        )
        response2 = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=request2,
        )

        assert response1.status_code == 200
        assert response2.status_code == 200

        data1 = response1.json()
        data2 = response2.json()

        assert data1["roundId"] != data2["roundId"]
