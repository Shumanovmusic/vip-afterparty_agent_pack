"""Contract validation tests for /spin per protocol_v1.md."""
import uuid

import pytest
from fastapi.testclient import TestClient


PLAYER_ID = "test-player-123"


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


class TestSpinRequestValidation:
    """Tests for spin request validation per protocol_v1.md."""

    def test_spin_requires_player_id(self, client_with_mock_redis: TestClient):
        """POST /spin without X-Player-Id must return INVALID_REQUEST (400)."""
        response = client_with_mock_redis.post("/spin", json=make_spin_request())
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "INVALID_REQUEST"
        assert data["error"]["recoverable"] is False

    def test_spin_rejects_invalid_bet(self, client_with_mock_redis: TestClient):
        """POST /spin with bet not in allowedBets must return INVALID_BET (400)."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(bet_amount=0.99),  # Not in allowedBets
        )
        assert response.status_code == 400
        data = response.json()
        assert data["protocolVersion"] == "1.0"
        assert data["error"]["code"] == "INVALID_BET"
        assert data["error"]["recoverable"] is False

    def test_spin_accepts_valid_bet(self, client_with_mock_redis: TestClient):
        """POST /spin with valid bet must return 200."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(bet_amount=1.00),  # Valid bet
        )
        assert response.status_code == 200


class TestSpinResponseSchema:
    """Tests for spin response schema per protocol_v1.md."""

    def test_spin_returns_protocol_version(self, client_with_mock_redis: TestClient):
        """POST /spin response must include protocolVersion."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        data = response.json()
        assert data["protocolVersion"] == "1.0"

    def test_spin_returns_round_id(self, client_with_mock_redis: TestClient):
        """POST /spin response must include server-generated roundId."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        data = response.json()
        assert "roundId" in data
        # Validate UUID format
        try:
            uuid.UUID(data["roundId"])
        except ValueError:
            pytest.fail("roundId is not a valid UUID")

    def test_spin_returns_context(self, client_with_mock_redis: TestClient):
        """POST /spin response must include context with currency."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        data = response.json()
        assert "context" in data
        assert data["context"]["currency"] == "USD"

    def test_spin_returns_outcome(self, client_with_mock_redis: TestClient):
        """POST /spin response must include outcome per protocol_v1.md."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        data = response.json()
        assert "outcome" in data
        outcome = data["outcome"]

        assert "totalWin" in outcome
        assert isinstance(outcome["totalWin"], (int, float))

        assert "totalWinX" in outcome
        assert isinstance(outcome["totalWinX"], (int, float))

        assert "isCapped" in outcome
        assert isinstance(outcome["isCapped"], bool)

        assert "capReason" in outcome
        # capReason can be null or string

    def test_spin_returns_events_array(self, client_with_mock_redis: TestClient):
        """POST /spin response must include events array."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        data = response.json()
        assert "events" in data
        assert isinstance(data["events"], list)

    def test_spin_events_contain_reveal(self, client_with_mock_redis: TestClient):
        """POST /spin events must contain reveal event with grid."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        data = response.json()
        events = data["events"]

        reveal_events = [e for e in events if e.get("type") == "reveal"]
        assert len(reveal_events) == 1

        reveal = reveal_events[0]
        assert "grid" in reveal
        assert isinstance(reveal["grid"], list)
        assert len(reveal["grid"]) == 5  # 5 reels
        for reel in reveal["grid"]:
            assert isinstance(reel, list)
            assert len(reel) == 3  # 3 rows

    def test_spin_returns_next_state(self, client_with_mock_redis: TestClient):
        """POST /spin response must include nextState per protocol_v1.md."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        data = response.json()
        assert "nextState" in data
        next_state = data["nextState"]

        assert "mode" in next_state
        assert next_state["mode"] in ["BASE", "FREE_SPINS"]

        assert "spinsRemaining" in next_state
        assert isinstance(next_state["spinsRemaining"], int)

        assert "heatLevel" in next_state
        assert isinstance(next_state["heatLevel"], int)


class TestBuyFeatureEvents:
    """Tests for BUY_FEATURE mode events per protocol_v1.md and GAME_RULES.md."""

    def test_buy_feature_triggers_free_spins(self, client_with_mock_redis: TestClient):
        """BUY_FEATURE mode must trigger enterFreeSpins event."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        assert response.status_code == 200
        data = response.json()

        events = data["events"]
        enter_fs_events = [e for e in events if e.get("type") == "enterFreeSpins"]
        assert len(enter_fs_events) >= 1, "BUY_FEATURE must trigger enterFreeSpins"

    def test_buy_feature_has_vip_buy_variant(self, client_with_mock_redis: TestClient):
        """BUY_FEATURE enterFreeSpins must have bonusVariant: vip_buy."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        data = response.json()

        events = data["events"]
        enter_fs_events = [e for e in events if e.get("type") == "enterFreeSpins"]
        assert len(enter_fs_events) >= 1

        enter_fs = enter_fs_events[0]
        assert enter_fs.get("reason") == "buy_feature", (
            f"BUY_FEATURE enterFreeSpins reason must be 'buy_feature', got {enter_fs.get('reason')}"
        )
        assert enter_fs.get("bonusVariant") == "vip_buy", (
            f"BUY_FEATURE enterFreeSpins bonusVariant must be 'vip_buy', got {enter_fs.get('bonusVariant')}"
        )

    def test_buy_feature_event_has_count(self, client_with_mock_redis: TestClient):
        """BUY_FEATURE enterFreeSpins must have count field."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        data = response.json()

        events = data["events"]
        enter_fs_events = [e for e in events if e.get("type") == "enterFreeSpins"]
        assert len(enter_fs_events) >= 1

        enter_fs = enter_fs_events[0]
        assert "count" in enter_fs, "enterFreeSpins must have count field"
        assert isinstance(enter_fs["count"], int), "enterFreeSpins count must be int"
        assert enter_fs["count"] > 0, "enterFreeSpins count must be positive"


class TestErrorResponseFormat:
    """Tests for error response format per error_codes.md."""

    def test_error_response_has_protocol_version(self, client_with_mock_redis: TestClient):
        """All error responses must include protocolVersion."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(bet_amount=999.99),  # Invalid
        )
        data = response.json()
        assert data["protocolVersion"] == "1.0"

    def test_error_response_has_error_object(self, client_with_mock_redis: TestClient):
        """All error responses must include error object."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(bet_amount=999.99),  # Invalid
        )
        data = response.json()
        assert "error" in data
        error = data["error"]

        assert "code" in error
        assert "message" in error
        assert "recoverable" in error
        assert isinstance(error["recoverable"], bool)
