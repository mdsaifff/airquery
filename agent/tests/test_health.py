from fastapi.testclient import TestClient

from main import app


def test_health() -> None:
    assert TestClient(app).get("/health").json() == {"ok": True}
