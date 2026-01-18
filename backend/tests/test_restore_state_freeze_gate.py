"""RestoreState Freeze Gate Tests.

Fast unit tests (<1s) that freeze restoreState behavior per protocol_v1.md.
Uses mock Redis (no Docker required).

Protocol restoreState schema (protocol_v1.md lines 45-58):
{
  "mode": "FREE_SPINS",
  "spinsRemaining": 7,
  "heatLevel": 4
}
"""
import uuid

import pytest
from fastapi.testclient import TestClient


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


class TestRestoreStateFreezeGate:
    """Freeze gate tests for restoreState behavior (B1-B6)."""

    def test_init_restoreState_null_when_no_state(
        self, client_with_mock_redis: TestClient
    ):
        """
        B1: GET /init restoreState MUST be null for player without saved state.

        Per protocol_v1.md: restoreState is null when no unfinished free spins.
        """
        player_id = f"freeze-b1-{uuid.uuid4()}"
        response = client_with_mock_redis.get(
            "/init",
            headers={"X-Player-Id": player_id},
        )
        assert response.status_code == 200
        data = response.json()

        assert "restoreState" in data, "restoreState field MUST be present"
        assert data["restoreState"] is None, "restoreState MUST be null for new player"

    def test_init_restoreState_present_when_spins_left_gt_0(
        self, client_with_mock_redis: TestClient
    ):
        """
        B2: GET /init restoreState MUST be present when spins_left > 0.

        Use BUY_FEATURE (vip_buy) to deterministically enter FREE_SPINS.
        Verify restoreState matches protocol_v1.md schema (strict keys only).
        """
        player_id = f"freeze-b2-{uuid.uuid4()}"

        # Trigger free spins via BUY_FEATURE
        spin_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        assert spin_response.status_code == 200
        spin_data = spin_response.json()
        assert spin_data["nextState"]["mode"] == "FREE_SPINS"
        assert spin_data["nextState"]["spinsRemaining"] > 0

        # Call /init - should have restoreState
        init_response = client_with_mock_redis.get(
            "/init",
            headers={"X-Player-Id": player_id},
        )
        assert init_response.status_code == 200
        init_data = init_response.json()

        # Verify restoreState present and matches protocol schema
        assert init_data["restoreState"] is not None, "restoreState MUST be present"
        restore = init_data["restoreState"]

        # Protocol_v1.md strict schema: mode, spinsRemaining, heatLevel
        assert "mode" in restore, "restoreState must have 'mode'"
        assert restore["mode"] == "FREE_SPINS"
        assert "spinsRemaining" in restore, "restoreState must have 'spinsRemaining'"
        assert isinstance(restore["spinsRemaining"], int)
        assert restore["spinsRemaining"] > 0
        assert "heatLevel" in restore, "restoreState must have 'heatLevel'"
        assert isinstance(restore["heatLevel"], int)

    def test_spin_continues_bonus_when_state_exists(
        self, client_with_mock_redis: TestClient
    ):
        """
        B3: /spin continues bonus when restoreState exists.

        Start vip_buy bonus, capture restoreState, then call POST /spin.
        Assert spins_left decreases by exactly 1 and state is saved back.
        """
        player_id = f"freeze-b3-{uuid.uuid4()}"

        # Start bonus via BUY_FEATURE
        spin_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        assert spin_response.status_code == 200
        initial_spins = spin_response.json()["nextState"]["spinsRemaining"]

        # Verify restoreState exists
        init_response = client_with_mock_redis.get(
            "/init",
            headers={"X-Player-Id": player_id},
        )
        assert init_response.json()["restoreState"] is not None
        assert init_response.json()["restoreState"]["spinsRemaining"] == initial_spins

        # Continue bonus with new spin
        continue_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(mode="NORMAL"),
        )
        assert continue_response.status_code == 200
        continue_data = continue_response.json()

        # spins_left should decrease by 1
        if continue_data["nextState"]["mode"] == "FREE_SPINS":
            assert continue_data["nextState"]["spinsRemaining"] == initial_spins - 1
            # Verify state is saved back
            verify_init = client_with_mock_redis.get(
                "/init",
                headers={"X-Player-Id": player_id},
            )
            assert verify_init.json()["restoreState"]["spinsRemaining"] == initial_spins - 1

    def test_state_cleared_on_bonus_end(
        self, client_with_mock_redis: TestClient
    ):
        """
        B4: restoreState MUST be null after bonusEnd.

        Continue spins until bonusEnd event is emitted (per protocol).
        Assert state is cleared and GET /init restoreState is null.
        """
        player_id = f"freeze-b4-{uuid.uuid4()}"

        # Start bonus via BUY_FEATURE
        spin_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        assert spin_response.status_code == 200
        data = spin_response.json()
        spins_remaining = data["nextState"]["spinsRemaining"]

        # Play through all free spins until bonus ends
        max_iterations = 50
        bonus_ended = False

        for _ in range(max_iterations):
            if spins_remaining <= 0:
                event_types = [e["type"] for e in data.get("events", [])]
                if "bonusEnd" in event_types:
                    bonus_ended = True
                break

            spin_response = client_with_mock_redis.post(
                "/spin",
                headers={"X-Player-Id": player_id},
                json=make_spin_request(mode="NORMAL"),
            )
            assert spin_response.status_code == 200
            data = spin_response.json()
            spins_remaining = data["nextState"]["spinsRemaining"]

            event_types = [e["type"] for e in data.get("events", [])]
            if "bonusEnd" in event_types:
                bonus_ended = True
                break

        assert bonus_ended, "bonusEnd event must be emitted"

        # Verify restoreState is now null
        init_response = client_with_mock_redis.get(
            "/init",
            headers={"X-Player-Id": player_id},
        )
        assert init_response.status_code == 200
        assert init_response.json()["restoreState"] is None, (
            "restoreState MUST be null after bonus ends"
        )

    def test_idempotency_does_not_double_consume_spin_in_bonus(
        self, client_with_mock_redis: TestClient
    ):
        """
        B5: Same clientRequestId returns cached response, no double spin consumption.

        During bonus, replay same clientRequestId - response must be identical
        and spins_left must decrease only once.
        """
        player_id = f"freeze-b5-{uuid.uuid4()}"

        # Start bonus via BUY_FEATURE
        spin_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        assert spin_response.status_code == 200
        initial_spins = spin_response.json()["nextState"]["spinsRemaining"]

        # First bonus spin with fixed clientRequestId
        fixed_request_id = str(uuid.uuid4())
        first_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(client_request_id=fixed_request_id),
        )
        assert first_response.status_code == 200
        first_data = first_response.json()

        # Replay same request (idempotency)
        replay_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(client_request_id=fixed_request_id),
        )
        assert replay_response.status_code == 200
        replay_data = replay_response.json()

        # Responses must be identical (same roundId)
        assert first_data["roundId"] == replay_data["roundId"], (
            "Idempotent replay must return same roundId"
        )
        assert first_data["nextState"] == replay_data["nextState"], (
            "Idempotent replay must return same nextState"
        )

        # Verify spin was not consumed twice
        new_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(),  # New clientRequestId
        )
        assert new_response.status_code == 200
        new_data = new_response.json()

        # Should have consumed exactly 2 spins (first + new), not 3
        if new_data["nextState"]["mode"] == "FREE_SPINS":
            assert new_data["nextState"]["spinsRemaining"] == initial_spins - 2

    def test_lock_applies_to_bonus_continuation(
        self, client_with_mock_redis: TestClient, mock_redis
    ):
        """
        B6: Concurrent spins during bonus return ROUND_IN_PROGRESS (409).

        Per error_codes.md: ROUND_IN_PROGRESS when lock is active.
        """
        player_id = f"freeze-b6-{uuid.uuid4()}"

        # Start bonus via BUY_FEATURE
        spin_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(mode="BUY_FEATURE"),
        )
        assert spin_response.status_code == 200
        assert spin_response.json()["nextState"]["mode"] == "FREE_SPINS"

        # Simulate lock being held by setting it directly
        import asyncio
        lock_key = f"lock:player:{player_id}"
        asyncio.run(mock_redis.set(lock_key, "1", nx=True, ex=30))

        # Attempt another spin - should fail with ROUND_IN_PROGRESS
        conflict_response = client_with_mock_redis.post(
            "/spin",
            headers={"X-Player-Id": player_id},
            json=make_spin_request(),
        )
        assert conflict_response.status_code == 409, (
            f"Expected 409 ROUND_IN_PROGRESS, got {conflict_response.status_code}"
        )
        error_data = conflict_response.json()
        assert error_data["error"]["code"] == "ROUND_IN_PROGRESS"
