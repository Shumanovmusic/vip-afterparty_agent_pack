"""Health endpoint tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200():
    """GET /health must return 200 OK."""
    response = client.get("/health")
    assert response.status_code == 200


def test_health_returns_ok_true():
    """GET /health must return {"ok": true}."""
    response = client.get("/health")
    data = response.json()
    assert data["ok"] is True
