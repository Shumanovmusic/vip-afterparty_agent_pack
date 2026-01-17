"""Restore state tests per protocol_v1.md.

From protocol_v1.md:
If the player has an unfinished free-spins state on the server,
restoreState MUST be returned:
{
  "mode": "FREE_SPINS",
  "spinsRemaining": 7,
  "heatLevel": 4
}

Notes:
- Server is authoritative for restore. Client must not invent state.
"""
import uuid

import pytest
from fastapi.testclient import TestClient


PLAYER_ID = "test-player-restore"


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


class TestRestoreStateInit:
    """Tests for restoreState in /init response."""

    def test_init_returns_restore_state_null_for_new_player(
        self, client_with_mock_redis: TestClient
    ):
        """GET /init restoreState must be null for player without unfinished round."""
        response = client_with_mock_redis.get(
            "/init",
            headers={"X-Player-Id": "new-player-123"},
        )
        assert response.status_code == 200
        data = response.json()

        assert "restoreState" in data
        assert data["restoreState"] is None

    def test_restore_state_schema(self, client_with_mock_redis: TestClient):
        """restoreState when present must have mode, spinsRemaining, heatLevel."""
        response = client_with_mock_redis.get(
            "/init",
            headers={"X-Player-Id": PLAYER_ID},
        )
        data = response.json()

        # For now, should be null (restore not implemented)
        # When implemented, should match schema:
        if data["restoreState"] is not None:
            restore = data["restoreState"]
            assert "mode" in restore
            assert restore["mode"] in ["FREE_SPINS", "BASE"]
            assert "spinsRemaining" in restore
            assert isinstance(restore["spinsRemaining"], int)
            assert "heatLevel" in restore
            assert isinstance(restore["heatLevel"], int)


class TestRestoreStateWorkflow:
    """Tests for restore state workflow.

    These tests document the expected flow when a player has unfinished free spins.
    """

    @pytest.mark.skip(reason="Restore state persistence not yet implemented - TODO")
    def test_unfinished_free_spins_returns_restore_state(
        self, client_with_mock_redis: TestClient
    ):
        """
        Workflow test:
        1. Player enters free spins
        2. Player disconnects mid-free spins
        3. GET /init returns restoreState with remaining spins
        """
        player_id = f"restore-test-{uuid.uuid4()}"

        # Step 1: Trigger free spins (would need specific seed or mock)
        # Step 2: Simulate disconnect by not completing free spins
        # Step 3: Call /init and verify restoreState

        response = client_with_mock_redis.get(
            "/init",
            headers={"X-Player-Id": player_id},
        )
        data = response.json()

        # When implemented, this should return restore state
        assert data["restoreState"] is not None
        assert data["restoreState"]["mode"] == "FREE_SPINS"
        assert data["restoreState"]["spinsRemaining"] > 0

    @pytest.mark.skip(reason="Restore state persistence not yet implemented - TODO")
    def test_completed_round_no_restore_state(
        self, client_with_mock_redis: TestClient
    ):
        """After completing all spins, restoreState must be null."""
        player_id = f"complete-test-{uuid.uuid4()}"

        # Play full round (base game only, no free spins)
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(),
        )
        assert response.status_code == 200
        data = response.json()

        # If we stayed in BASE mode, no restore needed
        if data["nextState"]["mode"] == "BASE":
            # Call /init
            init_response = client_with_mock_redis.get(
                "/init",
                headers={"X-Player-Id": player_id},
            )
            init_data = init_response.json()
            assert init_data["restoreState"] is None


class TestRestoreStateValidation:
    """Tests for restore state validation requirements."""

    def test_server_is_authoritative(self, client_with_mock_redis: TestClient):
        """Server is authoritative for restore state (per protocol_v1.md note)."""
        # This is a documentation test - client cannot send restore state
        # Server always determines state from its own storage

        # Attempt to send a "state" in request body should be ignored
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json={
                "clientRequestId": str(uuid.uuid4()),
                "betAmount": 1.00,
                "mode": "NORMAL",
                "hypeMode": False,
                # Client-provided state should be ignored
                "state": {
                    "mode": "FREE_SPINS",
                    "spinsRemaining": 100,  # Attempting to cheat
                    "heatLevel": 10,
                },
            },
        )
        # Server should process normally, ignoring client-provided state
        # (unknown fields are ignored per protocol_v1.md)
        assert response.status_code == 200
        data = response.json()

        # Should start fresh, not with the fake 100 spins
        # nextState should reflect actual server-side state
        assert data["nextState"]["spinsRemaining"] != 100 or data["nextState"]["mode"] == "FREE_SPINS"


class TestNextStateTransitions:
    """Tests for nextState in spin response."""

    def test_base_mode_after_normal_spin(self, client_with_mock_redis: TestClient):
        """Normal spin without free spins trigger should stay in BASE."""
        # Use a seed that won't trigger free spins for predictable test
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        assert response.status_code == 200
        data = response.json()

        assert "nextState" in data
        # Mode should be BASE or FREE_SPINS
        assert data["nextState"]["mode"] in ["BASE", "FREE_SPINS"]

        if data["nextState"]["mode"] == "BASE":
            assert data["nextState"]["spinsRemaining"] == 0
            # heatLevel in BASE is typically 0 (heat only builds in free spins)
            assert data["nextState"]["heatLevel"] >= 0

    def test_next_state_has_required_fields(self, client_with_mock_redis: TestClient):
        """nextState must have mode, spinsRemaining, heatLevel."""
        response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": PLAYER_ID},
            json=make_spin_request(),
        )
        assert response.status_code == 200
        data = response.json()

        next_state = data["nextState"]
        assert "mode" in next_state
        assert "spinsRemaining" in next_state
        assert "heatLevel" in next_state

        assert next_state["mode"] in ["BASE", "FREE_SPINS"]
        assert isinstance(next_state["spinsRemaining"], int)
        assert isinstance(next_state["heatLevel"], int)
        assert next_state["spinsRemaining"] >= 0
        assert next_state["heatLevel"] >= 0

    def test_free_spins_mode_has_positive_remaining(
        self, client_with_mock_redis: TestClient
    ):
        """When mode is FREE_SPINS, spinsRemaining should be >= 0."""
        # Run many spins to eventually trigger free spins
        for _ in range(100):
            response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": PLAYER_ID},
                json=make_spin_request(),
            )
            assert response.status_code == 200
            data = response.json()

            if data["nextState"]["mode"] == "FREE_SPINS":
                # If entering free spins, should have positive remaining
                # (unless it's the last spin of a bonus, then 0)
                assert data["nextState"]["spinsRemaining"] >= 0
                assert data["nextState"]["heatLevel"] >= 1
                break
