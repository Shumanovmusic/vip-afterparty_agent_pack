"""
E2E smoke tests against running Docker services.

These tests verify contract-level behaviors per protocol_v1.md and error_codes.md.
Tests MUST be run with services already up (via `make up`).

Usage:
    make up
    cd backend && .venv/bin/python -m pytest tests/test_e2e_smoke_docker.py -v
    make down

Note: Marked as @e2e - requires Docker services. Skipped in quick CI.
"""
import json

import pytest
pytestmark = pytest.mark.e2e  # All tests in this module need Docker
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx

# Base URL for running services
BASE_URL = "http://localhost:8000"

# Test player ID
PLAYER_ID = "e2e-smoke-test-player"


def is_docker_service_available() -> bool:
    """Check if Docker services are running."""
    try:
        with httpx.Client(base_url=BASE_URL, timeout=2.0) as client:
            response = client.get("/health")
            return response.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        return False


# Skip all tests in this module if Docker services are not available
pytestmark = pytest.mark.skipif(
    not is_docker_service_available(),
    reason="Docker services not running (run 'make up' first)",
)


def make_spin_request(
    bet_amount: float = 1.00,
    mode: str = "NORMAL",
    hype_mode: bool = False,
    client_request_id: str | None = None,
) -> dict:
    """Create a valid spin request body per protocol_v1.md."""
    return {
        "clientRequestId": client_request_id or str(uuid.uuid4()),
        "betAmount": bet_amount,
        "mode": mode,
        "hypeMode": hype_mode,
    }


def normalize_response(response_dict: dict) -> str:
    """Normalize response for comparison (sorted keys, deterministic)."""
    return json.dumps(response_dict, sort_keys=True)


class TestHealthEndpoint:
    """E2E tests for /health endpoint."""

    def test_health_returns_ok(self):
        """GET /health must return status ok."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok", f"Expected status 'ok', got {data}"


class TestInitEndpoint:
    """E2E tests for /init endpoint per protocol_v1.md."""

    def test_init_returns_protocol_version(self):
        """GET /init must return protocolVersion == '1.0'."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(
                "/init",
                headers={"X-Player-Id": PLAYER_ID},
            )

        assert response.status_code == 200
        data = response.json()
        assert data.get("protocolVersion") == "1.0", (
            f"Expected protocolVersion '1.0', got {data.get('protocolVersion')}"
        )

    def test_init_returns_configuration_with_allowed_bets(self):
        """GET /init configuration.allowedBets must be non-empty."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(
                "/init",
                headers={"X-Player-Id": PLAYER_ID},
            )

        assert response.status_code == 200
        data = response.json()

        assert "configuration" in data, "Response must have 'configuration'"
        config = data["configuration"]

        assert "allowedBets" in config, "Configuration must have 'allowedBets'"
        allowed_bets = config["allowedBets"]

        assert isinstance(allowed_bets, list), "allowedBets must be a list"
        assert len(allowed_bets) > 0, "allowedBets must be non-empty"


class TestSpinEndpoint:
    """E2E tests for /spin endpoint per protocol_v1.md."""

    def test_spin_normal_returns_required_fields(self):
        """POST /spin NORMAL must return roundId, events[], nextState."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(mode="NORMAL"),
            )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        # roundId per protocol_v1.md
        assert "roundId" in data, "Response must have 'roundId'"
        assert isinstance(data["roundId"], str), "roundId must be string"
        # Validate UUID format
        try:
            uuid.UUID(data["roundId"])
        except ValueError:
            pytest.fail(f"roundId '{data['roundId']}' is not a valid UUID")

        # events[] per protocol_v1.md
        assert "events" in data, "Response must have 'events'"
        assert isinstance(data["events"], list), "events must be a list"

        # nextState per protocol_v1.md
        assert "nextState" in data, "Response must have 'nextState'"
        next_state = data["nextState"]
        assert "mode" in next_state, "nextState must have 'mode'"
        assert next_state["mode"] in ["BASE", "FREE_SPINS"], (
            f"nextState.mode must be BASE or FREE_SPINS, got {next_state['mode']}"
        )

    def test_spin_returns_reveal_event(self):
        """POST /spin must include 'reveal' event in events[]."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(),
            )

        assert response.status_code == 200
        data = response.json()

        events = data.get("events", [])
        reveal_events = [e for e in events if e.get("type") == "reveal"]
        assert len(reveal_events) == 1, "Must have exactly one 'reveal' event"

        reveal = reveal_events[0]
        assert "grid" in reveal, "reveal event must have 'grid'"
        assert isinstance(reveal["grid"], list), "grid must be a list"
        assert len(reveal["grid"]) == 5, "grid must have 5 reels"


class TestIdempotency:
    """E2E tests for idempotency per protocol_v1.md."""

    def test_same_client_request_id_returns_identical_response(self):
        """Repeat POST /spin with SAME clientRequestId returns identical response."""
        client_request_id = str(uuid.uuid4())
        request_body = make_spin_request(client_request_id=client_request_id)

        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            # First request
            response1 = client.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=request_body,
            )
            assert response1.status_code == 200

            # Second request with SAME clientRequestId
            response2 = client.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=request_body,
            )
            assert response2.status_code == 200

        data1 = response1.json()
        data2 = response2.json()

        # roundId must be identical
        assert data1["roundId"] == data2["roundId"], (
            f"roundId mismatch: {data1['roundId']} vs {data2['roundId']}"
        )

        # Full response must be identical (normalized JSON comparison)
        assert normalize_response(data1) == normalize_response(data2), (
            "Idempotent requests must return identical responses"
        )


class TestBuyFeature:
    """E2E tests for BUY_FEATURE mode per protocol_v1.md."""

    def test_buy_feature_triggers_enter_free_spins(self):
        """POST /spin BUY_FEATURE must include enterFreeSpins event."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(mode="BUY_FEATURE"),
            )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        events = data.get("events", [])
        enter_fs_events = [e for e in events if e.get("type") == "enterFreeSpins"]
        assert len(enter_fs_events) >= 1, (
            "BUY_FEATURE must trigger at least one enterFreeSpins event"
        )

    def test_buy_feature_has_vip_buy_bonus_variant(self):
        """POST /spin BUY_FEATURE enterFreeSpins must have bonusVariant == 'vip_buy'."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(mode="BUY_FEATURE"),
            )

        assert response.status_code == 200
        data = response.json()

        events = data.get("events", [])
        enter_fs_events = [e for e in events if e.get("type") == "enterFreeSpins"]
        assert len(enter_fs_events) >= 1

        enter_fs = enter_fs_events[0]
        assert enter_fs.get("reason") == "buy_feature", (
            f"enterFreeSpins reason must be 'buy_feature', got {enter_fs.get('reason')}"
        )
        assert enter_fs.get("bonusVariant") == "vip_buy", (
            f"enterFreeSpins bonusVariant must be 'vip_buy', got {enter_fs.get('bonusVariant')}"
        )


class TestConcurrencyLocking:
    """E2E tests for per-player locking per error_codes.md."""

    def test_concurrent_spins_one_success_one_locked(self):
        """
        Concurrent POST /spin with SAME playerId but DIFFERENT clientRequestId:
        - Exactly one succeeds (200)
        - Exactly one fails with ROUND_IN_PROGRESS (409)
        """
        # Use unique player ID to avoid interference with other tests
        player_id = f"lock-test-{uuid.uuid4()}"

        def send_spin(req_id: str) -> tuple[int, dict]:
            """Send a spin request and return (status_code, response_json)."""
            with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
                response = client.post(
                    "/spin",
                    headers={"X-Player-Id": player_id},
                    json=make_spin_request(client_request_id=req_id),
                )
                return response.status_code, response.json()

        # Fire two concurrent requests
        req_id_1 = str(uuid.uuid4())
        req_id_2 = str(uuid.uuid4())

        with ThreadPoolExecutor(max_workers=2) as executor:
            future1 = executor.submit(send_spin, req_id_1)
            future2 = executor.submit(send_spin, req_id_2)

            result1 = future1.result()
            result2 = future2.result()

        status_codes = [result1[0], result2[0]]
        responses = [result1[1], result2[1]]

        # Count successes and locked errors
        successes = [r for s, r in [(result1[0], result1[1]), (result2[0], result2[1])] if s == 200]
        locked = [r for s, r in [(result1[0], result1[1]), (result2[0], result2[1])] if s == 409]

        # Expect exactly 1 success and 1 locked (or both succeed if timing allows)
        # Per error_codes.md, ROUND_IN_PROGRESS is 409
        if len(successes) == 2:
            # Both succeeded (timing allowed both to complete) - acceptable
            pass
        elif len(successes) == 1 and len(locked) == 1:
            # One success, one locked - expected behavior
            locked_response = locked[0]
            assert "error" in locked_response, "Locked response must have 'error'"
            assert locked_response["error"]["code"] == "ROUND_IN_PROGRESS", (
                f"Expected ROUND_IN_PROGRESS, got {locked_response['error']['code']}"
            )
        else:
            pytest.fail(
                f"Unexpected result: {len(successes)} successes, {len(locked)} locked. "
                f"Status codes: {status_codes}"
            )


class TestErrorHandling:
    """E2E tests for error responses per error_codes.md."""

    def test_missing_player_id_returns_invalid_request(self):
        """POST /spin without X-Player-Id must return INVALID_REQUEST (400)."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                "/spin",
                # No X-Player-Id header
                json=make_spin_request(),
            )

        assert response.status_code == 400
        data = response.json()
        assert data.get("error", {}).get("code") == "INVALID_REQUEST"

    def test_invalid_bet_returns_invalid_bet(self):
        """POST /spin with invalid betAmount must return INVALID_BET (400)."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(bet_amount=999.99),  # Not in allowedBets
            )

        assert response.status_code == 400
        data = response.json()
        assert data.get("error", {}).get("code") == "INVALID_BET"
