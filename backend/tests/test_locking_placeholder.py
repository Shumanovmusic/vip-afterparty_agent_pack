"""Locking tests - placeholder."""
import pytest


@pytest.mark.skip(reason="Not implemented yet: awaiting Redis locking implementation")
def test_concurrent_spins_blocked():
    """Concurrent spins for same player must return ROUND_IN_PROGRESS."""
    pass


@pytest.mark.skip(reason="Not implemented yet: awaiting Redis locking implementation")
def test_lock_released_after_spin():
    """Lock must be released after spin completes."""
    pass


@pytest.mark.skip(reason="Not implemented yet: awaiting Redis locking implementation")
def test_lock_timeout():
    """Lock must auto-expire to prevent deadlocks."""
    pass
