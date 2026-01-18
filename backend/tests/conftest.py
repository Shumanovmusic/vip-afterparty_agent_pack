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

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(
        self, key: str, value: str, nx: bool = False, ex: int | None = None
    ) -> bool | None:
        if nx and key in self._store:
            return None
        self._store[key] = value
        return True

    async def setex(self, key: str, ttl: int, value: str) -> bool:
        self._store[key] = value
        return True

    async def delete(self, key: str) -> int:
        if key in self._store:
            del self._store[key]
            return 1
        return 0

    async def close(self) -> None:
        pass

    def clear(self) -> None:
        self._store.clear()
        self._locks.clear()


class RecordingMockRedis(MockRedis):
    """Mock Redis that records operation order for atomicity gate tests."""

    def __init__(self):
        super().__init__()
        self.operations: list[str] = []

    async def get(self, key: str) -> str | None:
        op_type = self._classify_key(key, "get")
        self.operations.append(op_type)
        return await super().get(key)

    async def set(
        self, key: str, value: str, nx: bool = False, ex: int | None = None
    ) -> bool | None:
        op_type = self._classify_key(key, "set_nx" if nx else "set")
        self.operations.append(op_type)
        return await super().set(key, value, nx=nx, ex=ex)

    async def setex(self, key: str, ttl: int, value: str) -> bool:
        op_type = self._classify_key(key, "setex")
        self.operations.append(op_type)
        return await super().setex(key, ttl, value)

    async def delete(self, key: str) -> int:
        op_type = self._classify_key(key, "delete")
        self.operations.append(op_type)
        return await super().delete(key)

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
