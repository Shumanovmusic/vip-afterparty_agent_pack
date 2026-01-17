"""Event ordering tests per SCENARIO_V1.md and protocol_v1.md.

Event ordering (MUST) from protocol_v1.md:
1. reveal
2. optional base modifiers (spotlightWilds)
3. win presentation (winLine / winWays)
4. mode transitions (enterFreeSpins)
5. progression (heatUpdate)
6. bonus closure (bonusEnd) if applicable
7. event boundaries (eventStart/eventEnd) if applicable
8. celebration (winTier) if applicable
"""
import pytest

from app.logic.engine import GameEngine
from app.logic.models import GameMode, GameState
from app.logic.rng import SeededRNG
from app.protocol import SpinMode


# Event type priority order per protocol_v1.md + EVENT_SYSTEM.md
EVENT_ORDER = [
    "reveal",               # 1. Always first
    "spotlightWilds",       # 2. Optional base modifier
    "winLine",              # 3. Win presentation
    "afterpartyMeterUpdate",# 4. Afterparty Meter state change (may trigger rage)
    "eventStart",           # 5. Event boundaries (start)
    "enterFreeSpins",       # 6. Mode transitions
    "heatUpdate",           # 7. Progression
    "bonusEnd",             # 8. Bonus closure
    "eventEnd",             # 9. Event boundaries (end)
    "winTier",              # 10. Celebration (always last)
]


def get_event_order_index(event_type: str) -> int:
    """Get the order index for an event type."""
    if event_type in EVENT_ORDER:
        return EVENT_ORDER.index(event_type)
    # Unknown events go between known events
    return len(EVENT_ORDER)


def validate_event_ordering(events: list[dict]) -> tuple[bool, str]:
    """
    Validate that events are in correct order per protocol_v1.md.

    Returns (is_valid, error_message).
    """
    if not events:
        return True, ""

    # Reveal must be first
    if events[0].get("type") != "reveal":
        return False, f"First event must be 'reveal', got '{events[0].get('type')}'"

    # Check ordering
    prev_index = -1
    prev_type = None

    for event in events:
        event_type = event.get("type")
        curr_index = get_event_order_index(event_type)

        # Multiple winLine events are allowed at same priority
        if event_type == "winLine" and prev_type == "winLine":
            continue

        # Multiple heatUpdate events should not happen in single spin
        if event_type == "heatUpdate" and prev_type == "heatUpdate":
            return False, "Multiple heatUpdate events in single spin"

        # eventStart and eventEnd can appear multiple times (different events)
        if event_type in ("eventStart", "eventEnd") and prev_type in ("eventStart", "eventEnd"):
            continue

        # winTier must be last (no events after it)
        if prev_type == "winTier":
            return False, f"Event '{event_type}' appears after winTier"

        if curr_index < prev_index:
            return False, (
                f"Event ordering violation: '{event_type}' (index {curr_index}) "
                f"appears after '{prev_type}' (index {prev_index})"
            )

        prev_index = curr_index
        prev_type = event_type

    return True, ""


class TestEventOrdering:
    """Tests for event ordering per SCENARIO_V1.md and protocol_v1.md."""

    def test_reveal_always_first(self):
        """'reveal' event must always be the first event."""
        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )
            assert len(result.events) > 0
            assert result.events[0]["type"] == "reveal"

    def test_win_tier_always_last(self):
        """'winTier' event must always be the last event (if present)."""
        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )

            # Find winTier event
            win_tier_indices = [
                i for i, e in enumerate(result.events) if e["type"] == "winTier"
            ]

            if win_tier_indices:
                assert len(win_tier_indices) == 1, "Only one winTier event allowed"
                assert win_tier_indices[0] == len(result.events) - 1, (
                    "winTier must be last event"
                )

    def test_spotlight_wilds_before_win_line(self):
        """'spotlightWilds' must appear before 'winLine' events."""
        # Use seed that triggers spotlight wilds
        for seed in range(1000):
            rng = SeededRNG(seed=seed)
            engine = GameEngine(rng=rng)
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )

            spotlight_idx = None
            first_winline_idx = None

            for i, event in enumerate(result.events):
                if event["type"] == "spotlightWilds" and spotlight_idx is None:
                    spotlight_idx = i
                if event["type"] == "winLine" and first_winline_idx is None:
                    first_winline_idx = i

            if spotlight_idx is not None and first_winline_idx is not None:
                assert spotlight_idx < first_winline_idx, (
                    f"spotlightWilds at {spotlight_idx} must come before "
                    f"winLine at {first_winline_idx}"
                )
                break  # Found case, test passed

    def test_heat_update_after_enter_free_spins(self):
        """'heatUpdate' must appear after 'enterFreeSpins' when entering bonus."""
        # Find a seed that triggers free spins
        for seed in range(5000):
            rng = SeededRNG(seed=seed)
            engine = GameEngine(rng=rng)
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )

            enter_fs_idx = None
            heat_update_idx = None

            for i, event in enumerate(result.events):
                if event["type"] == "enterFreeSpins" and enter_fs_idx is None:
                    enter_fs_idx = i
                if event["type"] == "heatUpdate" and heat_update_idx is None:
                    heat_update_idx = i

            if enter_fs_idx is not None and heat_update_idx is not None:
                assert enter_fs_idx < heat_update_idx, (
                    f"enterFreeSpins at {enter_fs_idx} must come before "
                    f"heatUpdate at {heat_update_idx}"
                )
                break  # Found case, test passed

    def test_event_start_before_event_end(self):
        """'eventStart' must always appear before corresponding 'eventEnd'."""
        # Test with various seeds to catch event triggers
        for seed in range(1000):
            rng = SeededRNG(seed=seed)
            engine = GameEngine(rng=rng)

            # Create state with deadspins to trigger rage
            state = GameState(
                mode=GameMode.BASE,
                deadspins_streak=8,  # Will trigger rage
            )

            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=state,
            )

            event_starts = {}  # type -> index
            event_ends = {}

            for i, event in enumerate(result.events):
                if event["type"] == "eventStart":
                    event_type = event.get("eventType")
                    if event_type not in event_starts:
                        event_starts[event_type] = i
                elif event["type"] == "eventEnd":
                    event_type = event.get("eventType")
                    if event_type not in event_ends:
                        event_ends[event_type] = i

            # Verify ordering
            for event_type, start_idx in event_starts.items():
                if event_type in event_ends:
                    assert start_idx < event_ends[event_type], (
                        f"eventStart({event_type}) at {start_idx} must come before "
                        f"eventEnd({event_type}) at {event_ends[event_type]}"
                    )

    def test_all_events_follow_protocol_order(self):
        """All spin results must have events in protocol_v1.md order."""
        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        for i in range(500):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )

            is_valid, error = validate_event_ordering(result.events)
            assert is_valid, f"Spin {i}: {error}"

    def test_bonus_end_only_when_free_spins_complete(self):
        """'bonusEnd' event must only appear when free spins are finishing."""
        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        # Run in free spins mode with 1 spin remaining
        state = GameState(
            mode=GameMode.FREE_SPINS,
            free_spins_remaining=1,
            heat_level=5,
        )

        result = engine.spin(
            bet_amount=1.00,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=state,
        )

        bonus_end_events = [e for e in result.events if e["type"] == "bonusEnd"]
        assert len(bonus_end_events) == 1, "bonusEnd should appear when free spins complete"
        assert bonus_end_events[0]["bonusType"] == "freespins"

    def test_no_bonus_end_mid_free_spins(self):
        """'bonusEnd' event must NOT appear during free spins."""
        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        # Run in free spins mode with multiple spins remaining
        state = GameState(
            mode=GameMode.FREE_SPINS,
            free_spins_remaining=5,
            heat_level=3,
        )

        result = engine.spin(
            bet_amount=1.00,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=state,
        )

        bonus_end_events = [e for e in result.events if e["type"] == "bonusEnd"]
        assert len(bonus_end_events) == 0, "bonusEnd should NOT appear mid-free spins"


class TestEventContent:
    """Tests for event content validity per protocol_v1.md."""

    def test_reveal_has_valid_grid(self):
        """'reveal' event must contain valid 5x3 grid."""
        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        result = engine.spin(
            bet_amount=1.00,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=None,
        )

        reveal = result.events[0]
        assert reveal["type"] == "reveal"
        assert "grid" in reveal

        grid = reveal["grid"]
        assert len(grid) == 5, "Grid must have 5 reels"
        for reel in grid:
            assert len(reel) == 3, "Each reel must have 3 rows"
            for symbol in reel:
                assert isinstance(symbol, int), "Symbols must be integers"
                assert 0 <= symbol <= 10, "Symbol values must be valid"

    def test_win_line_has_required_fields(self):
        """'winLine' events must have lineId, amount, winX."""
        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )

            for event in result.events:
                if event["type"] == "winLine":
                    assert "lineId" in event
                    assert "amount" in event
                    assert "winX" in event
                    assert isinstance(event["lineId"], int)
                    assert isinstance(event["amount"], (int, float))
                    assert isinstance(event["winX"], (int, float))

    def test_event_type_values(self):
        """Event types must be one of the protocol-defined types."""
        valid_types = {
            "reveal",
            "spotlightWilds",
            "winLine",
            "eventStart",
            "eventEnd",
            "enterFreeSpins",
            "heatUpdate",
            "bonusEnd",
            "winTier",
            "afterpartyMeterUpdate",  # Afterparty Meter state change
        }

        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )

            for event in result.events:
                assert event["type"] in valid_types, (
                    f"Unknown event type: {event['type']}"
                )

    def test_win_tier_values(self):
        """winTier.tier must be one of: none, big, mega, epic."""
        valid_tiers = {"none", "big", "mega", "epic"}

        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        for _ in range(100):
            result = engine.spin(
                bet_amount=1.00,
                mode=SpinMode.NORMAL,
                hype_mode=False,
                state=None,
            )

            for event in result.events:
                if event["type"] == "winTier":
                    assert event["tier"] in valid_tiers
                    assert "winX" in event

    def test_finale_path_values(self):
        """bonusEnd.finalePath must be one of: upgrade, multiplier, standard."""
        valid_paths = {"upgrade", "multiplier", "standard"}

        rng = SeededRNG(seed=42)
        engine = GameEngine(rng=rng)

        # Run free spins to completion
        state = GameState(
            mode=GameMode.FREE_SPINS,
            free_spins_remaining=1,
            heat_level=5,
        )

        result = engine.spin(
            bet_amount=1.00,
            mode=SpinMode.NORMAL,
            hype_mode=False,
            state=state,
        )

        for event in result.events:
            if event["type"] == "bonusEnd":
                assert event["finalePath"] in valid_paths
