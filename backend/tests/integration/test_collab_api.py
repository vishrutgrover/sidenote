import pytest


def meeting(client, title="Weekly Product Sync"):
    return next(m for m in client.get("/api/meetings").json() if m["title"] == title)


def lines(client, m):
    return client.get(f"/api/meetings/{m['id']}/transcript").json()


# ---- comments -----------------------------------------------------------------------

def test_comment_thread_lifecycle(client):
    m = meeting(client)
    line = lines(client, m)[2]
    r = client.post(f"/api/meetings/{m['id']}/comments", json={"segment_id": line["id"], "body": "  Good point  "})
    assert r.status_code == 201
    c = r.json()
    assert c["body"] == "Good point" and c["author"] == "Vishrut Grover" and c["quote"] == line["text"] and c["start_sec"] == line["start_sec"]
    assert client.get(f"/api/meetings/{m['id']}/comments").json() == [c]
    assert lines(client, m)[2]["comment_count"] == 1 and lines(client, m)[0]["comment_count"] == 0
    assert client.delete(f"/api/comments/{c['id']}").status_code == 204
    assert client.get(f"/api/meetings/{m['id']}/comments").json() == []
    assert lines(client, m)[2]["comment_count"] == 0


def test_comments_are_ordered_by_line_then_age(client):
    m = meeting(client)
    ls = lines(client, m)
    for seg, body in [(ls[5], "later line"), (ls[1], "first"), (ls[1], "second")]:
        client.post(f"/api/meetings/{m['id']}/comments", json={"segment_id": seg["id"], "body": body})
    assert [c["body"] for c in client.get(f"/api/meetings/{m['id']}/comments").json()] == ["first", "second", "later line"]


def test_comment_must_target_a_line_of_the_same_meeting(client):
    a, b = meeting(client), meeting(client, "Engineering Standup")
    foreign = lines(client, b)[0]["id"]
    assert client.post(f"/api/meetings/{a['id']}/comments", json={"segment_id": foreign, "body": "x"}).status_code == 400
    assert client.post(f"/api/meetings/{a['id']}/comments", json={"segment_id": 99999, "body": "x"}).status_code == 400


@pytest.mark.parametrize("body", [{"body": "x"}, {"segment_id": 1}, {"segment_id": 1, "body": "  "}, {"segment_id": 1, "body": "x" * 2001}])
def test_invalid_comments_are_rejected(client, body):
    assert client.post(f"/api/meetings/{meeting(client)['id']}/comments", json=body).status_code == 422


def test_deleting_a_line_comment_or_meeting_cleans_up(client):
    m = meeting(client)
    seg = lines(client, m)[0]
    client.post(f"/api/meetings/{m['id']}/comments", json={"segment_id": seg["id"], "body": "x"})
    assert client.delete("/api/comments/99999").status_code == 404
    client.delete(f"/api/meetings/{m['id']}")
    assert client.get(f"/api/meetings/{m['id']}/comments").status_code == 404


# ---- soundbites -----------------------------------------------------------------------

def test_soundbite_lifecycle_with_excerpt(client):
    m = meeting(client)
    ls = lines(client, m)
    r = client.post(f"/api/meetings/{m['id']}/soundbites", json={"start_sec": ls[1]["start_sec"], "end_sec": ls[1]["end_sec"], "title": "  Search news  "})
    assert r.status_code == 201 and r.json()["title"] == "Search news"
    assert ls[1]["text"][:40] in r.json()["excerpt"]
    sid = r.json()["id"]
    assert client.patch(f"/api/soundbites/{sid}", json={"title": "Renamed"}).json()["title"] == "Renamed"
    assert [s["title"] for s in client.get(f"/api/meetings/{m['id']}/soundbites").json()] == ["Renamed"]
    assert client.delete(f"/api/soundbites/{sid}").status_code == 204
    assert client.get(f"/api/meetings/{m['id']}/soundbites").json() == []


def test_soundbites_list_in_time_order(client):
    m = meeting(client)
    for start in (30, 5, 15):
        client.post(f"/api/meetings/{m['id']}/soundbites", json={"start_sec": start, "end_sec": start + 4, "title": f"at {start}"})
    assert [s["start_sec"] for s in client.get(f"/api/meetings/{m['id']}/soundbites").json()] == [5, 15, 30]


@pytest.mark.parametrize("body", [
    {"start_sec": 10, "end_sec": 5, "title": "backwards"},
    {"start_sec": 5, "end_sec": 5, "title": "empty"},
    {"start_sec": -1, "end_sec": 5, "title": "negative"},
    {"start_sec": 0, "end_sec": 99999, "title": "past the end"},
    {"start_sec": 0, "end_sec": 5, "title": "  "},
    {"start_sec": 0, "end_sec": 5},
    {"start_sec": "soon", "end_sec": 5, "title": "x"},
])
def test_invalid_soundbites_are_rejected(client, body):
    m = meeting(client)
    assert client.post(f"/api/meetings/{m['id']}/soundbites", json=body).status_code == 422
    assert client.get(f"/api/meetings/{m['id']}/soundbites").json() == []


def test_soundbite_edge_cases_404(client):
    assert client.patch("/api/soundbites/9999", json={"title": "x"}).status_code == 404
    assert client.delete("/api/soundbites/9999").status_code == 404
    assert client.post("/api/meetings/999/soundbites", json={"start_sec": 0, "end_sec": 1, "title": "x"}).status_code == 404


# ---- bookmarks ---------------------------------------------------------------------------

def test_bookmark_lifecycle(client):
    m = meeting(client)
    r = client.post(f"/api/meetings/{m['id']}/bookmarks", json={"time_sec": 42.5, "note": " revisit "})
    assert r.status_code == 201 and r.json()["note"] == "revisit"
    client.post(f"/api/meetings/{m['id']}/bookmarks", json={"time_sec": 3})
    marks = client.get(f"/api/meetings/{m['id']}/bookmarks").json()
    assert [b["time_sec"] for b in marks] == [3, 42.5] and marks[0]["note"] == ""
    assert client.delete(f"/api/bookmarks/{r.json()['id']}").status_code == 204
    assert len(client.get(f"/api/meetings/{m['id']}/bookmarks").json()) == 1
    assert client.delete(f"/api/bookmarks/{r.json()['id']}").status_code == 404


@pytest.mark.parametrize("body", [{"time_sec": -1}, {"time_sec": 99999}, {}, {"time_sec": 1, "note": "x" * 301}])
def test_invalid_bookmarks_are_rejected(client, body):
    assert client.post(f"/api/meetings/{meeting(client)['id']}/bookmarks", json=body).status_code == 422


def test_everything_added_to_a_meeting_goes_when_it_is_deleted(client):
    from app.db import SessionLocal
    from app.models import Bookmark, Comment, Soundbite
    from sqlalchemy import func, select
    m = meeting(client)
    client.post(f"/api/meetings/{m['id']}/comments", json={"segment_id": lines(client, m)[0]["id"], "body": "c"})
    client.post(f"/api/meetings/{m['id']}/soundbites", json={"start_sec": 0, "end_sec": 3, "title": "s"})
    client.post(f"/api/meetings/{m['id']}/bookmarks", json={"time_sec": 1})
    client.delete(f"/api/meetings/{m['id']}")
    with SessionLocal() as db:
        for model in (Comment, Soundbite, Bookmark):
            assert db.scalar(select(func.count(model.id))) == 0
