"""Pytest fixtures for backend tests."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Generator, Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.redis_service import RedisService


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


@pytest.fixture
def mock_redis() -> MockRedis:
    """Create a fresh mock Redis for each test."""
    return MockRedis()


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
