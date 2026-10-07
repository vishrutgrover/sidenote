import io

import pytest

PASTE = "[00:00:01] Ana: We should ship on Friday.\n[00:00:09] Ben: I agree, risk is low."


def titles(r):
    assert r.status_code == 200, r.text
    return [m["title"] for m in r.json()]


# ---- list, search, filter, sort ------------------------------------------

def test_list_is_newest_first_by_default(client):
    t = titles(client.get("/api/meetings"))
    assert t[0] == "Weekly Product Sync" and t[-1] == "Interview: Backend Engineer"
    assert titles(client.get("/api/meetings?sort=oldest")) == t[::-1]


def test_each_item_has_what_the_library_row_needs(client):
    m = client.get("/api/meetings").json()[0]
    assert m["overview"] and m["topics"] and m["duration_sec"] > 0
    assert sum(p["is_host"] for p in m["participants"]) == 1


def test_search_matches_title_or_participant_case_insensitively(client):
    assert titles(client.get("/api/meetings?q=onboarding")) == ["Design Review: Onboarding Flow"]
    assert "Customer Call: Acme Logistics" in titles(client.get("/api/meetings?q=DANIEL"))


@pytest.mark.parametrize("q", ["%", "_", "100%", "'; DROP TABLE meetings;--"])
def test_search_treats_wildcards_and_quotes_as_plain_text(client, q):
    assert titles(client.get("/api/meetings", params={"q": q})) == []
    assert len(titles(client.get("/api/meetings"))) == 6  # nothing was damaged


def test_filter_by_participant_and_topic(client):
    daniel = next(p["person_id"] for m in client.get("/api/meetings").json() for p in m["participants"] if p["name"] == "Daniel Okafor")
    assert set(titles(client.get(f"/api/meetings?participant={daniel}"))) == {"Customer Call: Acme Logistics", "Q4 Roadmap Planning"}
    assert set(titles(client.get("/api/meetings?topic=planning"))) == {"Weekly Product Sync", "Q4 Roadmap Planning"}
    assert titles(client.get("/api/meetings?topic=planning&topic=hiring")).__len__() == 3  # either tag matches


def test_filter_by_time_window(client):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    p = lambda **kw: {k: v.isoformat() for k, v in kw.items()}  # noqa: E731
    assert titles(client.get("/api/meetings", params=p(after=now - timedelta(hours=1)))) == ["Weekly Product Sync"]
    assert len(titles(client.get("/api/meetings", params=p(after=day_start - timedelta(days=2))))) >= 3
    assert titles(client.get("/api/meetings", params=p(before=now - timedelta(days=30)))) == []
    assert titles(client.get("/api/meetings", params=p(after=now + timedelta(hours=1)))) == []


def test_time_window_respects_the_callers_timezone(client):
    # 23:00 in New York (UTC-5) is 04:00 UTC the next day; the offset must be honoured
    as_ny = "2000-01-01T23:00:00-05:00"
    assert len(titles(client.get("/api/meetings", params={"after": as_ny}))) == 6
    assert titles(client.get("/api/meetings", params={"before": as_ny})) == []


def test_filter_by_duration(client):
    assert len(titles(client.get("/api/meetings?min_minutes=0&max_minutes=60"))) == 6
    assert titles(client.get("/api/meetings?min_minutes=60")) == []


@pytest.mark.parametrize("qs", ["sort=sideways", "after=not-a-date", "participant=abc"])
def test_bad_query_values_are_rejected(client, qs):
    assert client.get(f"/api/meetings?{qs}").status_code == 422


# ---- create --------------------------------------------------------------

def test_create_from_pasted_text(client):
    r = client.post("/api/meetings", data={"title": "Launch call", "transcript": PASTE})
    assert r.status_code == 201
    m = r.json()
    assert m["title"] == "Launch call" and m["source"] == "paste" and m["status"] == "ready"
    assert [p["name"] for p in m["participants"]] == ["Ana", "Ben"]
    assert titles(client.get("/api/meetings"))[0] == "Launch call"
    assert client.get(f"/api/meetings/{m['id']}").status_code == 200


def test_create_from_uploaded_vtt_uses_filename_as_title(client):
    vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nAna: Hello there\n"
    r = client.post("/api/meetings", files={"file": ("kickoff.vtt", io.BytesIO(vtt.encode()), "text/vtt")})
    assert r.status_code == 201 and r.json()["title"] == "kickoff" and r.json()["source"] == "upload"


@pytest.mark.parametrize("data", [{"transcript": ""}, {"transcript": "   \n "}, {"transcript": '[{"text": "no start"}]'}])
def test_create_rejects_empty_or_broken_transcripts(client, data):
    r = client.post("/api/meetings", data=data)
    assert r.status_code == 400 and r.json()["detail"]
    assert len(titles(client.get("/api/meetings"))) == 6  # nothing half-created


def test_create_rejects_binary_and_oversized_files(client):
    r = client.post("/api/meetings", files={"file": ("a.txt", io.BytesIO(b"\xff\xfe\x00bad"), "text/plain")})
    assert r.status_code == 400
    big = io.BytesIO(b"Ana: " + b"x" * 2_100_000)
    assert client.post("/api/meetings", files={"file": ("big.txt", big, "text/plain")}).status_code == 413


def test_very_long_title_is_cut_not_crashed(client):
    r = client.post("/api/meetings", data={"title": "T" * 500, "transcript": PASTE})
    assert r.status_code == 201 and len(r.json()["title"]) == 200


# ---- read, update, delete ------------------------------------------------

def test_unknown_meeting_is_404_everywhere(client):
    assert client.get("/api/meetings/999").status_code == 404
    assert client.patch("/api/meetings/999", json={"title": "x"}).status_code == 404
    assert client.delete("/api/meetings/999").status_code == 404


def test_rename_trims_and_rejects_blank_titles(client):
    mid = client.get("/api/meetings").json()[0]["id"]
    assert client.patch(f"/api/meetings/{mid}", json={"title": "  New name  "}).json()["title"] == "New name"
    assert client.patch(f"/api/meetings/{mid}", json={"title": "   "}).status_code == 422
    assert client.patch(f"/api/meetings/{mid}", json={"title": "x" * 201}).status_code == 422


def test_edit_participants_adds_and_removes_without_losing_transcript(client):
    m = client.post("/api/meetings", data={"transcript": PASTE}).json()
    r = client.patch(f"/api/meetings/{m['id']}", json={"participants": ["Ana", "Cara"]})
    assert [p["name"] for p in r.json()["participants"]] == ["Ana", "Cara"]
    from app.db import SessionLocal
    from app.models import Segment
    from sqlalchemy import select
    with SessionLocal() as db:
        segs = db.scalars(select(Segment).where(Segment.meeting_id == m["id"])).all()
        assert len(segs) == 2 and [s.speaker_id is None for s in segs] == [False, True]  # Ben's line stays, unassigned


def test_patch_with_no_fields_changes_nothing(client):
    before = client.get("/api/meetings").json()[0]
    assert client.patch(f"/api/meetings/{before['id']}", json={}).json() == before


def test_delete_removes_the_meeting_and_everything_under_it(client):
    from app.db import SessionLocal
    from app.models import ActionItem, Segment
    from sqlalchemy import func, select
    mid = client.get("/api/meetings").json()[0]["id"]
    assert client.delete(f"/api/meetings/{mid}").status_code == 204
    assert client.get(f"/api/meetings/{mid}").status_code == 404
    assert len(titles(client.get("/api/meetings"))) == 5
    with SessionLocal() as db:
        assert db.scalar(select(func.count(Segment.id)).where(Segment.meeting_id == mid)) == 0
        assert db.scalar(select(func.count(ActionItem.id)).where(ActionItem.meeting_id == mid)) == 0
