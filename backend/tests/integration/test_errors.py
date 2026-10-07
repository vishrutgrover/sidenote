import pytest
from fastapi.testclient import TestClient

from app.deps import get_db
from app.main import app

ORIGIN = {"Origin": "http://localhost:3000"}


@pytest.fixture
def crashing():
    """A client that sees what a browser would see when the server hits an unexpected error."""
    def broken():
        raise RuntimeError("database exploded")
        yield  # pragma: no cover
    app.dependency_overrides[get_db] = broken
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


def test_an_unexpected_error_is_a_json_500_not_a_dropped_connection(crashing):
    r = crashing.get("/api/meetings")
    assert r.status_code == 500
    assert r.json() == {"detail": "Something went wrong on the server"}


def test_the_error_response_still_carries_cors_headers_so_the_browser_can_read_it(crashing):
    r = crashing.get("/api/meetings", headers=ORIGIN)
    assert r.status_code == 500
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_the_message_does_not_leak_the_internal_error(crashing):
    assert "exploded" not in crashing.get("/api/meetings").text


def test_expected_errors_keep_their_own_messages(client):
    r = client.get("/api/meetings/999", headers=ORIGIN)
    assert r.status_code == 404 and r.json()["detail"] == "Meeting not found"
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_the_failure_is_logged_for_the_developer(crashing, caplog):
    crashing.get("/api/meetings")
    assert "Unhandled error on GET /api/meetings" in caplog.text
