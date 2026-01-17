"""Validation tests per protocol_v1.md and error_codes.md."""
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


PLAYER_ID = "test-player-validation"


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


class TestMissingPlayerId:
    """Tests for missing X-Player-Id header per protocol_v1.md."""

    def test_init_without_player_id_returns_400(self, client_with_mock_redis: TestClient):
        """GET /init without X-Player-Id must return INVALID_REQUEST (400)."""
        response = client_with_mock_redis.get("/init")
        assert response.status_code == 400
        data = response.json()
        assert data["protocolVersion"] == "1.0"
        assert data["error"]["code"] == "INVALID_REQUEST"
        assert data["error"]["recoverable"] is False

    def test_init_with_empty_player_id_returns_400(self, client_with_mock_redis: TestClient):
        """GET /init with empty X-Player-Id must return INVALID_REQUEST (400)."""
        response = client_with_mock_redis.get("/init", headers={"X-Player-Id": ""})
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "INVALID_REQUEST"

    def test_spin_without_player_id_returns_400(self, client_with_mock_redis: TestClient):
        """POST /spin without X-Player-Id must return INVALID_REQUEST (400)."""
        response = client_with_mock_redis.post("/spin", json=make_spin_request())
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "INVALID_REQUEST"
        assert data["error"]["recoverable"] is False


class TestInvalidBet:
    """Tests for INVALID_BET per error_codes.md."""

    def test_bet_not_in_allowed_bets_returns_400(self, client_with_mock_redis: TestClient):
        """betAmount not in allowedBets must return INVALID_BET (400)."""
        # 0.99 is not in [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00]
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(bet_amount=0.99),
        )
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "INVALID_BET"
        assert data["error"]["recoverable"] is False

    def test_negative_bet_returns_400(self, client_with_mock_redis: TestClient):
        """Negative betAmount must return INVALID_BET."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(bet_amount=-1.00),
        )
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "INVALID_BET"

    def test_zero_bet_returns_400(self, client_with_mock_redis: TestClient):
        """Zero betAmount must return INVALID_BET."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(bet_amount=0),
        )
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "INVALID_BET"

    def test_all_allowed_bets_accepted(self, client_with_mock_redis: TestClient):
        """All values in allowedBets must be accepted."""
        allowed_bets = [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00]

        for bet in allowed_bets:
            response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(bet_amount=bet),
            )
            assert response.status_code == 200, f"Bet {bet} should be allowed"


class TestInvalidMode:
    """Tests for invalid spin mode."""

    def test_invalid_mode_returns_400(self, client_with_mock_redis: TestClient):
        """Invalid mode value must return INVALID_REQUEST."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json={
                "clientRequestId": str(uuid.uuid4()),
                "betAmount": 1.00,
                "mode": "INVALID_MODE",
                "hypeMode": False,
            },
        )
        assert response.status_code == 422  # Pydantic validation


class TestFeatureDisabled:
    """Tests for FEATURE_DISABLED per error_codes.md."""

    def test_buy_feature_disabled_returns_409(self, client_with_mock_redis: TestClient):
        """BUY_FEATURE mode when disabled must return FEATURE_DISABLED (409)."""
        # Temporarily patch the settings to disable buy feature
        with patch("app.validators.settings") as mock_settings:
            mock_settings.enable_buy_feature = False
            mock_settings.enable_hype_mode_ante_bet = True
            mock_settings.allowed_bets = [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00]
            response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(mode="BUY_FEATURE"),
            )
            assert response.status_code == 409
            data = response.json()
            assert data["error"]["code"] == "FEATURE_DISABLED"
            assert data["error"]["recoverable"] is False

    def test_hype_mode_disabled_returns_409(self, client_with_mock_redis: TestClient):
        """Hype mode when disabled must return FEATURE_DISABLED (409)."""
        with patch("app.validators.settings") as mock_settings:
            mock_settings.enable_buy_feature = True
            mock_settings.enable_hype_mode_ante_bet = False
            mock_settings.allowed_bets = [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00]
            response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(hype_mode=True),
            )
            assert response.status_code == 409
            data = response.json()
            assert data["error"]["code"] == "FEATURE_DISABLED"
            assert data["error"]["recoverable"] is False

    def test_buy_feature_enabled_accepted(self, client_with_mock_redis: TestClient):
        """BUY_FEATURE mode when enabled must be accepted."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        # Should succeed (200) when enabled
        assert response.status_code == 200

    def test_hype_mode_enabled_accepted(self, client_with_mock_redis: TestClient):
        """Hype mode when enabled must be accepted."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(hype_mode=True),
        )
        assert response.status_code == 200


class TestMissingFields:
    """Tests for missing required fields."""

    def test_missing_client_request_id_returns_422(self, client_with_mock_redis: TestClient):
        """Missing clientRequestId must return 422 (validation error)."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json={
                "betAmount": 1.00,
                "mode": "NORMAL",
                "hypeMode": False,
            },
        )
        assert response.status_code == 422

    def test_missing_bet_amount_returns_422(self, client_with_mock_redis: TestClient):
        """Missing betAmount must return 422."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json={
                "clientRequestId": str(uuid.uuid4()),
                "mode": "NORMAL",
                "hypeMode": False,
            },
        )
        assert response.status_code == 422
