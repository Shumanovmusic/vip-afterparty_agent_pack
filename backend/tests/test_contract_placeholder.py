"""Contract validation tests - placeholder."""
import pytest


@pytest.mark.skip(reason="Not implemented yet: awaiting game logic implementation")
def test_init_returns_valid_configuration():
    """GET /init must return configuration per protocol_v1.md."""
    pass


@pytest.mark.skip(reason="Not implemented yet: awaiting game logic implementation")
def test_spin_returns_valid_events():
    """POST /spin must return events[] per protocol_v1.md."""
    pass


@pytest.mark.skip(reason="Not implemented yet: awaiting game logic implementation")
def test_spin_response_matches_protocol_schema():
    """POST /spin response must match SpinResponse schema."""
    pass


@pytest.mark.skip(reason="Not implemented yet: awaiting game logic implementation")
def test_error_response_format():
    """All errors must use ErrorResponse format from protocol_v1.md."""
    pass
