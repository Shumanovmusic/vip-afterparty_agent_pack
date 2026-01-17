"""Idempotency tests - placeholder."""
import pytest


@pytest.mark.skip(reason="Not implemented yet: awaiting Redis idempotency implementation")
def test_same_request_id_returns_cached_response():
    """Same clientRequestId must return identical response."""
    pass


@pytest.mark.skip(reason="Not implemented yet: awaiting Redis idempotency implementation")
def test_different_payload_same_id_returns_conflict():
    """Same clientRequestId with different payload must return IDEMPOTENCY_CONFLICT."""
    pass


@pytest.mark.skip(reason="Not implemented yet: awaiting Redis idempotency implementation")
def test_idempotency_key_expiry():
    """Idempotency keys must expire after TTL."""
    pass
