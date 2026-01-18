"""
E2E Hardening Tests (HARDEN PACK)

Tests 6 and 8 from the HARDEN PACK:
- Test 6: Event ordering invariant (reveal before dependent events)
- Test 8: Mode fields traceability (hype_mode, bonusVariant)

Prerequisites: Docker services running (make up)

Usage:
    make up
    cd backend && .venv/bin/python -m pytest tests/test_e2e_harden_docker.py -v
    make down

Note: Marked as @e2e - requires Docker services. Skipped in quick CI.
"""
import pytest
import uuid

import httpx

pytestmark = pytest.mark.e2e  # All tests in this module need Docker

BASE_URL = "http://localhost:8000"
PLAYER_ID = "e2e-harden-test-player"


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


def get_event_index(events: list, event_type: str) -> int | None:
    """Return index of first event with given type, or None if not found."""
    for i, event in enumerate(events):
        if event.get("type") == event_type:
            return i
    return None


def get_all_event_indices(events: list, event_type: str) -> list[int]:
    """Return all indices of events with given type."""
    return [i for i, event in enumerate(events) if event.get("type") == event_type]


class TestEventOrdering:
    """
    Test 6: Event ordering invariant per protocol_v1.md section 'Event ordering (MUST)'.

    Per protocol_v1.md lines 149-160, typical ordering is:
    1. optional eventStart
    2. reveal (ALWAYS PRESENT)
    3. optional spotlightWilds
    4. win presentation (winLine / winWays)
    5. mode transitions (enterFreeSpins)
    6. progression (heatUpdate)
    7. bonus closure (bonusEnd)
    8. optional eventEnd
    9. celebration (winTier) - LAST
    """

    def test_reveal_always_first_data_event(self):
        """reveal MUST appear before spotlightWilds, winLine, etc."""
        # Run multiple spins to increase chance of getting interesting events
        for _ in range(10):
            with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
                response = client.post(
                    "/spin",
                    headers={"X-Player-Id": f"{PLAYER_ID}-{uuid.uuid4()}"},
                    json=make_spin_request(),
                )

            assert response.status_code == 200
            data = response.json()
            events = data.get("events", [])

            reveal_idx = get_event_index(events, "reveal")
            assert reveal_idx is not None, "reveal event MUST always be present"

            # Check reveal comes before spotlightWilds
            spotlight_idx = get_event_index(events, "spotlightWilds")
            if spotlight_idx is not None:
                assert reveal_idx < spotlight_idx, (
                    f"reveal (idx={reveal_idx}) must come before "
                    f"spotlightWilds (idx={spotlight_idx})"
                )

            # Check reveal comes before winLine
            win_line_indices = get_all_event_indices(events, "winLine")
            for win_line_idx in win_line_indices:
                assert reveal_idx < win_line_idx, (
                    f"reveal (idx={reveal_idx}) must come before "
                    f"winLine (idx={win_line_idx})"
                )

    def test_win_tier_is_last_if_present(self):
        """winTier MUST be last event in array (if present)."""
        # Run multiple spins to find one with winTier
        for _ in range(20):
            with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
                response = client.post(
                    "/spin",
                    headers={"X-Player-Id": f"{PLAYER_ID}-{uuid.uuid4()}"},
                    json=make_spin_request(),
                )

            assert response.status_code == 200
            data = response.json()
            events = data.get("events", [])

            win_tier_idx = get_event_index(events, "winTier")
            if win_tier_idx is not None:
                assert win_tier_idx == len(events) - 1, (
                    f"winTier must be last event (idx={win_tier_idx}, "
                    f"len={len(events)})"
                )
                return  # Found and verified

        # If no winTier found in 20 spins, that's ok - test passes

    def test_enter_free_spins_before_bonus_end(self):
        """enterFreeSpins MUST appear before bonusEnd (if both present)."""
        # Use BUY_FEATURE to guarantee free spins
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            # Start bonus via BUY_FEATURE
            response = client.post(
                "/spin",
                headers={"X-Player-Id": f"{PLAYER_ID}-bonus-order-{uuid.uuid4()}"},
                json=make_spin_request(mode="BUY_FEATURE"),
            )

        assert response.status_code == 200
        data = response.json()
        events = data.get("events", [])

        enter_fs_idx = get_event_index(events, "enterFreeSpins")
        bonus_end_idx = get_event_index(events, "bonusEnd")

        # If both present, enterFreeSpins must come first
        if enter_fs_idx is not None and bonus_end_idx is not None:
            assert enter_fs_idx < bonus_end_idx, (
                f"enterFreeSpins (idx={enter_fs_idx}) must come before "
                f"bonusEnd (idx={bonus_end_idx})"
            )

    def test_event_start_before_event_end(self):
        """eventStart MUST appear before eventEnd for same eventType."""
        for _ in range(20):
            with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
                response = client.post(
                    "/spin",
                    headers={"X-Player-Id": f"{PLAYER_ID}-{uuid.uuid4()}"},
                    json=make_spin_request(),
                )

            assert response.status_code == 200
            data = response.json()
            events = data.get("events", [])

            event_start_idx = get_event_index(events, "eventStart")
            event_end_idx = get_event_index(events, "eventEnd")

            # If both present, eventStart must come first
            if event_start_idx is not None and event_end_idx is not None:
                assert event_start_idx < event_end_idx, (
                    f"eventStart (idx={event_start_idx}) must come before "
                    f"eventEnd (idx={event_end_idx})"
                )


class TestModeFieldsTraceability:
    """
    Test 8: Mode fields traceability per TELEMETRY.md and protocol_v1.md.

    Verifies that mode-specific fields are present and correct:
    - hypeMode request accepted
    - BUY_FEATURE bonusVariant == 'vip_buy'
    - VIP Buy bonusEnd has multiplier fields
    """

    def test_hype_mode_request_accepted(self):
        """Spin with hypeMode=true must succeed (200)."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                "/spin",
                headers={"X-Player-Id": f"{PLAYER_ID}-hype-{uuid.uuid4()}"},
                json=make_spin_request(hype_mode=True),
            )

        assert response.status_code == 200, (
            f"hypeMode=true spin must return 200, got {response.status_code}: "
            f"{response.text}"
        )
        data = response.json()
        assert "roundId" in data, "Response must have roundId"
        assert "events" in data, "Response must have events"

    def test_buy_feature_enter_free_spins_has_vip_buy_variant(self):
        """BUY_FEATURE enterFreeSpins MUST have bonusVariant='vip_buy'."""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                "/spin",
                headers={"X-Player-Id": f"{PLAYER_ID}-vip-{uuid.uuid4()}"},
                json=make_spin_request(mode="BUY_FEATURE"),
            )

        assert response.status_code == 200
        data = response.json()
        events = data.get("events", [])

        enter_fs_events = [e for e in events if e.get("type") == "enterFreeSpins"]
        assert len(enter_fs_events) >= 1, (
            "BUY_FEATURE must have at least one enterFreeSpins event"
        )

        enter_fs = enter_fs_events[0]
        assert enter_fs.get("reason") == "buy_feature", (
            f"enterFreeSpins reason must be 'buy_feature', "
            f"got {enter_fs.get('reason')}"
        )
        assert enter_fs.get("bonusVariant") == "vip_buy", (
            f"enterFreeSpins bonusVariant must be 'vip_buy', "
            f"got {enter_fs.get('bonusVariant')}"
        )

    def test_vip_buy_bonus_end_has_multiplier_fields(self):
        """VIP Buy bonusEnd MUST have bonusMultiplierApplied and totalWinXPreMultiplier.

        Play through entire bonus round triggered by BUY_FEATURE to verify
        bonusEnd event has required multiplier fields.
        """
        player_id = f"{PLAYER_ID}-vip-bonus-end-{uuid.uuid4()}"

        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            # Start bonus via BUY_FEATURE
            response = client.post(
                "/spin",
                headers={"X-Player-Id": player_id},
                json=make_spin_request(mode="BUY_FEATURE"),
            )

            assert response.status_code == 200
            data = response.json()
            assert data["nextState"]["mode"] == "FREE_SPINS"
            spins_remaining = data["nextState"]["spinsRemaining"]

            # Play through all free spins until bonus ends
            bonus_end_event = None
            max_iterations = 50  # Safety limit

            for _ in range(max_iterations):
                if spins_remaining <= 0:
                    # Check if we got bonusEnd in the last response
                    bonus_end_events = [
                        e for e in data.get("events", []) if e.get("type") == "bonusEnd"
                    ]
                    if bonus_end_events:
                        bonus_end_event = bonus_end_events[0]
                    break

                response = client.post(
                    "/spin",
                    headers={"X-Player-Id": player_id},
                    json=make_spin_request(),
                )
                assert response.status_code == 200
                data = response.json()
                spins_remaining = data["nextState"]["spinsRemaining"]

                # Check for bonusEnd event
                bonus_end_events = [
                    e for e in data.get("events", []) if e.get("type") == "bonusEnd"
                ]
                if bonus_end_events:
                    bonus_end_event = bonus_end_events[0]
                    break

            # Verify bonusEnd was found and has required fields
            assert bonus_end_event is not None, "bonusEnd event must be emitted"
            assert "bonusMultiplierApplied" in bonus_end_event, (
                "bonusEnd must have bonusMultiplierApplied field"
            )
            assert "totalWinXPreMultiplier" in bonus_end_event, (
                "bonusEnd must have totalWinXPreMultiplier field"
            )

    def test_buy_feature_bonus_end_has_correct_bonus_variant(self):
        """BUY_FEATURE bonusEnd.bonusVariant MUST be 'vip_buy'.

        Play through entire bonus round triggered by BUY_FEATURE to verify
        bonusEnd event has correct bonusVariant.
        """
        player_id = f"{PLAYER_ID}-vip-variant-{uuid.uuid4()}"

        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            # Start bonus via BUY_FEATURE
            response = client.post(
                "/spin",
                headers={"X-Player-Id": player_id},
                json=make_spin_request(mode="BUY_FEATURE"),
            )

            assert response.status_code == 200
            data = response.json()
            assert data["nextState"]["mode"] == "FREE_SPINS"
            spins_remaining = data["nextState"]["spinsRemaining"]

            # Play through all free spins until bonus ends
            bonus_end_event = None
            max_iterations = 50  # Safety limit

            for _ in range(max_iterations):
                if spins_remaining <= 0:
                    # Check if we got bonusEnd in the last response
                    bonus_end_events = [
                        e for e in data.get("events", []) if e.get("type") == "bonusEnd"
                    ]
                    if bonus_end_events:
                        bonus_end_event = bonus_end_events[0]
                    break

                response = client.post(
                    "/spin",
                    headers={"X-Player-Id": player_id},
                    json=make_spin_request(),
                )
                assert response.status_code == 200
                data = response.json()
                spins_remaining = data["nextState"]["spinsRemaining"]

                # Check for bonusEnd event
                bonus_end_events = [
                    e for e in data.get("events", []) if e.get("type") == "bonusEnd"
                ]
                if bonus_end_events:
                    bonus_end_event = bonus_end_events[0]
                    break

            # Verify bonusEnd was found and has correct bonusVariant
            assert bonus_end_event is not None, "bonusEnd event must be emitted"
            assert bonus_end_event.get("bonusVariant") == "vip_buy", (
                f"bonusEnd.bonusVariant must be 'vip_buy', "
                f"got {bonus_end_event.get('bonusVariant')}"
            )


class TestRestoreStateE2E:
    """
    E2E tests for restoreState re-init flow (Docker required).

    C1: Verify /init returns restoreState when bonus is unfinished
    C2: Verify bonusEnd clears state and /init returns null
    """

    def test_restore_state_present_on_init_when_unfinished_bonus(self):
        """
        C1: /init returns restoreState when bonus is unfinished.

        1. Call /init (restoreState null expected for new player)
        2. Start BUY_FEATURE bonus
        3. Play exactly 1 bonus spin (spins_left still > 0)
        4. Call /init again - restoreState MUST be present
        """
        player_id = f"{PLAYER_ID}-e2e-c1-{uuid.uuid4()}"

        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            # Step 1: Initial /init - should be null
            init1 = client.get("/init", headers={"X-Player-Id": player_id})
            assert init1.status_code == 200
            assert init1.json()["restoreState"] is None

            # Step 2: Start bonus via BUY_FEATURE
            buy_response = client.post(
                "/spin",
                headers={"X-Player-Id": player_id},
                json=make_spin_request(mode="BUY_FEATURE"),
            )
            assert buy_response.status_code == 200
            buy_data = buy_response.json()
            assert buy_data["nextState"]["mode"] == "FREE_SPINS"
            initial_spins = buy_data["nextState"]["spinsRemaining"]
            assert initial_spins > 1, "Need multiple spins to test partial play"

            # Step 3: Play 1 bonus spin
            spin1 = client.post(
                "/spin",
                headers={"X-Player-Id": player_id},
                json=make_spin_request(mode="NORMAL"),
            )
            assert spin1.status_code == 200
            spin1_data = spin1.json()

            # Should still be in FREE_SPINS with decremented count
            if spin1_data["nextState"]["mode"] == "FREE_SPINS":
                assert spin1_data["nextState"]["spinsRemaining"] == initial_spins - 1

                # Step 4: Call /init - restoreState MUST be present
                init2 = client.get("/init", headers={"X-Player-Id": player_id})
                assert init2.status_code == 200
                init2_data = init2.json()

                assert init2_data["restoreState"] is not None, (
                    "restoreState MUST be present mid-bonus"
                )
                # Verify schema per protocol_v1.md
                restore = init2_data["restoreState"]
                assert restore["mode"] == "FREE_SPINS"
                assert restore["spinsRemaining"] == initial_spins - 1
                assert "heatLevel" in restore

    def test_bonus_end_emitted_after_restore_continuation_and_state_cleared(self):
        """
        C2: bonusEnd clears state and /init returns restoreState=null.

        1. Get restoreState (from unfinished bonus)
        2. Continue /spin until bonusEnd occurs
        3. Assert bonusEnd event present (per protocol)
        4. Call /init - restoreState MUST be null
        """
        player_id = f"{PLAYER_ID}-e2e-c2-{uuid.uuid4()}"

        with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
            # Start bonus
            buy_response = client.post(
                "/spin",
                headers={"X-Player-Id": player_id},
                json=make_spin_request(mode="BUY_FEATURE"),
            )
            assert buy_response.status_code == 200
            data = buy_response.json()
            assert data["nextState"]["mode"] == "FREE_SPINS"
            spins_remaining = data["nextState"]["spinsRemaining"]

            # Verify restoreState exists
            init1 = client.get("/init", headers={"X-Player-Id": player_id})
            assert init1.json()["restoreState"] is not None

            # Continue until bonusEnd
            bonus_ended = False
            max_iterations = 50
            bonus_end_event = None

            for _ in range(max_iterations):
                if spins_remaining <= 0:
                    event_types = [e["type"] for e in data.get("events", [])]
                    if "bonusEnd" in event_types:
                        bonus_ended = True
                        bonus_end_event = next(
                            e for e in data["events"] if e["type"] == "bonusEnd"
                        )
                    break

                spin_response = client.post(
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
                    bonus_end_event = next(
                        e for e in data["events"] if e["type"] == "bonusEnd"
                    )
                    break

            # Assert bonusEnd was emitted
            assert bonus_ended, "bonusEnd event must be emitted"
            assert bonus_end_event is not None
            assert data["nextState"]["mode"] == "BASE"

            # Verify restoreState is now null
            init2 = client.get("/init", headers={"X-Player-Id": player_id})
            assert init2.status_code == 200
            assert init2.json()["restoreState"] is None, (
                "restoreState MUST be null after bonus ends"
            )
