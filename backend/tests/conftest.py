"""Pytest fixtures for backend tests."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Generator, Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.redis_service import RedisService


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (require audit/seed files)"
    )
    config.addinivalue_line(
        "markers", "e2e: marks tests as e2e (require Docker services)"
    )
    config.addinivalue_line(
        "markers", "gate: marks tests as gate tests (run in nightly only)"
    )


class MockRedis:
    """Mock Redis client for testing."""

    def __init__(self):
        self._store: dict[str, str] = {}
        self._locks: set[str] = set()
        self._last_set_ex: int | None = None  # Track last SET EX value for TTL tests

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(
        self, key: str, value: str, nx: bool = False, ex: int | None = None
    ) -> bool | None:
        if nx and key in self._store:
            return None
        self._store[key] = value
        self._last_set_ex = ex  # Track TTL for gate tests
        return True

    async def setex(self, key: str, ttl: int, value: str) -> bool:
        self._store[key] = value
        return True

    async def delete(self, key: str) -> int:
        if key in self._store:
            del self._store[key]
            return 1
        return 0

    async def eval(self, script: str, numkeys: int, *args) -> int:
        """
        Execute Lua script (simplified mock for compare-and-delete).

        Supports the RELEASE_LOCK_SCRIPT pattern:
        - KEYS[1] = args[0] (key)
        - ARGV[1] = args[1] (expected value)
        Returns 1 if deleted, 0 if value didn't match.
        """
        key = args[0]
        expected_value = args[1]
        current_value = self._store.get(key)
        if current_value == expected_value:
            del self._store[key]
            return 1
        return 0

    async def close(self) -> None:
        pass

    def clear(self) -> None:
        self._store.clear()
        self._locks.clear()
        self._last_set_ex = None


class RecordingMockRedis(MockRedis):
    """Mock Redis that records operation order for atomicity gate tests."""

    def __init__(self):
        super().__init__()
        self.operations: list[str] = []
        self.lock_token: str | None = None  # Track lock token for tests
        self.lock_ttl: int | None = None  # Track lock TTL for tests

    async def get(self, key: str) -> str | None:
        op_type = self._classify_key(key, "get")
        self.operations.append(op_type)
        return await super().get(key)

    async def set(
        self, key: str, value: str, nx: bool = False, ex: int | None = None
    ) -> bool | None:
        op_type = self._classify_key(key, "set_nx" if nx else "set")
        self.operations.append(op_type)
        # Track lock token and TTL for gate tests
        if key.startswith("lock:player:") and nx:
            self.lock_token = value
            self.lock_ttl = ex
        return await super().set(key, value, nx=nx, ex=ex)

    async def setex(self, key: str, ttl: int, value: str) -> bool:
        op_type = self._classify_key(key, "setex")
        self.operations.append(op_type)
        return await super().setex(key, ttl, value)

    async def delete(self, key: str) -> int:
        op_type = self._classify_key(key, "delete")
        self.operations.append(op_type)
        return await super().delete(key)

    async def eval(self, script: str, numkeys: int, *args) -> int:
        """Record eval operation and delegate to parent."""
        key = args[0]
        op_type = self._classify_key(key, "eval")
        self.operations.append(op_type)
        return await super().eval(script, numkeys, *args)

    def _classify_key(self, key: str, operation: str) -> str:
        """Classify operation by key type for easier assertion."""
        if key.startswith("lock:player:"):
            return f"lock_{operation}"
        elif key.startswith("idem:"):
            return f"idempotency_{operation}"
        elif key.startswith("state:player:"):
            return f"state_{operation}"
        return f"unknown_{operation}"

    def clear(self) -> None:
        super().clear()
        self.operations.clear()
        self.lock_token = None
        self.lock_ttl = None


@pytest.fixture
def mock_redis() -> MockRedis:
    """Create a fresh mock Redis for each test."""
    return MockRedis()


@pytest.fixture
def recording_mock_redis() -> RecordingMockRedis:
    """Create a RecordingMockRedis that logs operation order."""
    return RecordingMockRedis()


@pytest.fixture
def client_with_recording_redis(recording_mock_redis: RecordingMockRedis) -> Generator[tuple[TestClient, RecordingMockRedis], None, None]:
    """Create TestClient with recording Redis for atomicity gate tests."""
    from app.redis_service import redis_service

    original_client = redis_service._client
    redis_service._client = recording_mock_redis

    with TestClient(app) as client:
        yield client, recording_mock_redis

    redis_service._client = original_client
    recording_mock_redis.clear()


@pytest.fixture
def redis_service_with_mock(mock_redis: MockRedis) -> Generator[RedisService, None, None]:
    """Create RedisService with mock client."""
    service = RedisService()
    service._client = mock_redis
    yield service
    mock_redis.clear()


@pytest.fixture
def client_with_mock_redis(mock_redis: MockRedis) -> Generator[TestClient, None, None]:
    """Create TestClient with mocked Redis."""
    from app.redis_service import redis_service

    # Patch the global redis_service client
    original_client = redis_service._client
    redis_service._client = mock_redis

    with TestClient(app) as client:
        yield client

    # Restore original
    redis_service._client = original_client
    mock_redis.clear()


@pytest.fixture
def test_client() -> TestClient:
    """Create basic TestClient (for tests that don't need Redis)."""
    return TestClient(app)
