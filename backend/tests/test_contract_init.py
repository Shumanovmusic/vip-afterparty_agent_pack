"""Contract validation tests for /init per protocol_v1.md."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PLAYER_ID = "test-player-123"


def test_init_requires_player_id():
    """GET /init without X-Player-Id must return INVALID_REQUEST (400)."""
    response = client.get("/init")
    assert response.status_code == 400
    data = response.json()
    assert data["protocolVersion"] == "1.0"
    assert data["error"]["code"] == "INVALID_REQUEST"
    assert data["error"]["recoverable"] is False


def test_init_returns_200():
    """GET /init with X-Player-Id must return 200."""
    response = client.get("/init", headers={"X-Player-Id": PLAYER_ID})
    assert response.status_code == 200


def test_init_returns_protocol_version():
    """GET /init must include protocolVersion per protocol_v1.md."""
    response = client.get("/init", headers={"X-Player-Id": PLAYER_ID})
    data = response.json()
    assert data["protocolVersion"] == "1.0"


def test_init_returns_configuration():
    """GET /init must include configuration object per protocol_v1.md."""
    response = client.get("/init", headers={"X-Player-Id": PLAYER_ID})
    data = response.json()

    assert "configuration" in data
    config = data["configuration"]

    # Required fields per protocol_v1.md
    assert "currency" in config
    assert config["currency"] == "USD"

    assert "allowedBets" in config
    assert isinstance(config["allowedBets"], list)
    assert len(config["allowedBets"]) > 0
    assert all(isinstance(b, (int, float)) for b in config["allowedBets"])

    assert "enableBuyFeature" in config
    assert isinstance(config["enableBuyFeature"], bool)

    assert "buyFeatureCostMultiplier" in config
    assert isinstance(config["buyFeatureCostMultiplier"], int)

    assert "enableTurbo" in config
    assert isinstance(config["enableTurbo"], bool)

    assert "enableHypeModeAnteBet" in config
    assert isinstance(config["enableHypeModeAnteBet"], bool)

    assert "hypeModeCostIncrease" in config
    assert isinstance(config["hypeModeCostIncrease"], (int, float))


def test_init_returns_allowed_bets_from_config():
    """GET /init allowedBets must match CONFIG.md values."""
    response = client.get("/init", headers={"X-Player-Id": PLAYER_ID})
    data = response.json()

    # Expected values from CONFIG.md via protocol_v1.md
    expected_bets = [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00]
    assert data["configuration"]["allowedBets"] == expected_bets


def test_init_returns_hype_mode_cost_increase():
    """GET /init hypeModeCostIncrease must be 0.25 per CONFIG.md."""
    response = client.get("/init", headers={"X-Player-Id": PLAYER_ID})
    data = response.json()

    # Expected value from CONFIG.md: HYPE_MODE_COST_INCREASE=0.25
    assert data["configuration"]["hypeModeCostIncrease"] == 0.25


def test_init_returns_restore_state_null_for_new_player():
    """GET /init restoreState must be null for player without unfinished round."""
    response = client.get("/init", headers={"X-Player-Id": PLAYER_ID})
    data = response.json()

    assert "restoreState" in data
    assert data["restoreState"] is None


def test_init_response_schema_exact():
    """GET /init response must match protocol_v1.md schema exactly."""
    response = client.get("/init", headers={"X-Player-Id": PLAYER_ID})
    data = response.json()

    # Top-level keys
    expected_keys = {"protocolVersion", "configuration", "restoreState"}
    assert set(data.keys()) == expected_keys

    # Configuration keys
    config_keys = {
        "currency",
        "allowedBets",
        "enableBuyFeature",
        "buyFeatureCostMultiplier",
        "enableTurbo",
        "enableHypeModeAnteBet",
        "hypeModeCostIncrease",
    }
    assert set(data["configuration"].keys()) == config_keys
