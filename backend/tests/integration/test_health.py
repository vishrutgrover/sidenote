def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_startup_seeds_the_database(client):
    from app.db import SessionLocal
    from app.models import Meeting
    from sqlalchemy import func, select

    with SessionLocal() as db:
        assert db.scalar(select(func.count(Meeting.id))) >= 6
