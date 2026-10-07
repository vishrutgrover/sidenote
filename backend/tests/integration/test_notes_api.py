import pytest


def meeting(client, title="Weekly Product Sync"):
    return next(m for m in client.get("/api/meetings").json() if m["title"] == title)


# ---- summary and notes ------------------------------------------------------

def test_summary_has_overview_keywords_and_timestamped_sections(client):
    m = meeting(client)
    s = client.get(f"/api/meetings/{m['id']}/summary").json()
    assert s["overview"] and "search rollout" in s["keywords"]
    assert [sec["title"] for sec in s["sections"]] == ["Search release", "Onboarding drop-off", "Sprint planning"]
    assert all(b["timestamp_sec"] is not None for sec in s["sections"] for b in sec["bullets"])


def test_meeting_without_notes_returns_empty_notes_not_an_error(client):
    from app.db import SessionLocal
    from app.models import User
    from app.services.meetings import create_from_lines
    from app.services.parser import parse
    from sqlalchemy import select
    with SessionLocal() as db:  # created directly, so the background notes step never runs
        m = create_from_lines(db, db.scalar(select(User)), "Raw", parse("Ana: just text"), "paste", status="processing")
        mid = m.id
    s = client.get(f"/api/meetings/{mid}/summary").json()
    assert s == {"overview": "", "keywords": [], "sections": []}


def test_edit_overview_and_bullet(client):
    m = meeting(client)
    r = client.patch(f"/api/meetings/{m['id']}/summary", json={"overview": "  Rewritten  "})
    assert r.json()["overview"] == "Rewritten"
    bullet = r.json()["sections"][0]["bullets"][0]
    assert client.patch(f"/api/note-bullets/{bullet['id']}", json={"text": "Edited"}).json()["text"] == "Edited"
    assert client.get(f"/api/meetings/{m['id']}/summary").json()["sections"][0]["bullets"][0]["text"] == "Edited"


def test_overview_can_be_written_for_a_meeting_that_had_none(client):
    from app.db import SessionLocal
    from app.models import Summary
    from sqlalchemy import delete
    m = client.post("/api/meetings", data={"transcript": "Ana: text"}).json()
    with SessionLocal() as db:
        db.execute(delete(Summary).where(Summary.meeting_id == m["id"]))
        db.commit()
    r = client.patch(f"/api/meetings/{m['id']}/summary", json={"overview": "Manual notes"})
    assert r.status_code == 200 and r.json()["overview"] == "Manual notes"


@pytest.mark.parametrize("url,body", [
    ("/api/meetings/{id}/summary", {"overview": "x" * 5001}),
    ("/api/meetings/{id}/summary", {}),
    ("/api/note-bullets/1", {"text": ""}),
    ("/api/note-bullets/1", {"text": "x" * 2001}),
])
def test_invalid_note_edits_are_rejected(client, url, body):
    assert client.patch(url.format(id=meeting(client)["id"]), json=body).status_code == 422


def test_missing_bullet_and_meeting_are_404(client):
    assert client.patch("/api/note-bullets/99999", json={"text": "x"}).status_code == 404
    assert client.get("/api/meetings/999/summary").status_code == 404
    assert client.get("/api/meetings/999/insights").status_code == 404


def test_insights_endpoint(client):
    m = meeting(client)
    i = client.get(f"/api/meetings/{m['id']}/insights").json()
    assert sum(v["count"] for v in i["sentiments"].values()) == 12
    assert abs(sum(s["share_pct"] for s in i["speakers"]) - 100) <= 2
    assert len(i["filters"]["tasks"]) == 3 and i["filters"]["questions"]


# ---- action items ---------------------------------------------------------------

def test_action_items_for_a_meeting(client):
    m = meeting(client)
    items = client.get(f"/api/meetings/{m['id']}/action-items").json()
    assert len(items) == 3 and all(i["meeting_title"] == m["title"] for i in items)
    assert [i["is_done"] for i in items].count(True) == 1


def test_create_edit_complete_and_delete(client):
    m = meeting(client)
    seat = m["participants"][1]["id"]
    r = client.post(f"/api/meetings/{m['id']}/action-items", json={"text": "  Book room  ", "assignee_id": seat, "timestamp_sec": 12.5})
    assert r.status_code == 201 and r.json()["text"] == "Book room" and r.json()["assignee"]["id"] == seat
    iid = r.json()["id"]
    assert client.patch(f"/api/action-items/{iid}", json={"is_done": True}).json()["is_done"] is True
    r = client.patch(f"/api/action-items/{iid}", json={"text": "Book bigger room", "due_date": "2030-01-02T10:00:00+02:00"})
    assert r.json()["text"] == "Book bigger room" and r.json()["due_date"].startswith("2030-01-02T08:00")  # stored as UTC
    assert client.patch(f"/api/action-items/{iid}", json={"assignee_id": None}).json()["assignee"] is None
    assert client.patch(f"/api/action-items/{iid}", json={}).json()["text"] == "Book bigger room"  # nothing sent, nothing changed
    assert client.delete(f"/api/action-items/{iid}").status_code == 204
    assert client.patch(f"/api/action-items/{iid}", json={"is_done": False}).status_code == 404


def test_assignee_must_belong_to_the_same_meeting(client):
    a, b = meeting(client), meeting(client, "Engineering Standup")
    stranger = b["participants"][1]["id"]
    assert client.post(f"/api/meetings/{a['id']}/action-items", json={"text": "x", "assignee_id": stranger}).status_code == 400
    assert client.post(f"/api/meetings/{a['id']}/action-items", json={"text": "x", "assignee_id": 99999}).status_code == 400
    item = client.get(f"/api/meetings/{a['id']}/action-items").json()[0]
    assert client.patch(f"/api/action-items/{item['id']}", json={"assignee_id": stranger}).status_code == 400


@pytest.mark.parametrize("body", [{}, {"text": ""}, {"text": "  "}, {"text": "x" * 1001}, {"text": "ok", "timestamp_sec": -1}])
def test_invalid_new_action_items_are_rejected(client, body):
    m = meeting(client)
    assert client.post(f"/api/meetings/{m['id']}/action-items", json=body).status_code == 422


def test_text_and_done_cannot_be_nulled(client):
    item = client.get("/api/action-items").json()[0]
    r = client.patch(f"/api/action-items/{item['id']}", json={"text": None, "is_done": None})
    assert r.status_code == 200 and r.json()["text"] == item["text"] and r.json()["is_done"] == item["is_done"]


def test_cross_meeting_list_puts_open_tasks_first_and_filters(client):
    everything = client.get("/api/action-items").json()
    assert len(everything) == 3 + 2 + 2 + 3 + 2 + 2
    done = [i["is_done"] for i in everything]
    assert done == sorted(done)  # False before True
    assert all(i["is_done"] for i in client.get("/api/action-items?done=true").json())
    assert not any(i["is_done"] for i in client.get("/api/action-items?done=false").json())


def test_my_tasks_are_those_assigned_to_the_logged_in_person(client):
    mine = client.get("/api/action-items?mine=true").json()
    assert mine and all(i["assignee"]["person_id"] == mine[0]["assignee"]["person_id"] for i in mine)
    assert {i["assignee"]["name"] for i in mine} == {"Vishrut Grover"}
    assert any(i["text"] == "Send security overview to Daniel" for i in mine)


def test_tasks_of_a_deleted_meeting_disappear(client):
    m = meeting(client)
    before = len(client.get("/api/action-items").json())
    client.delete(f"/api/meetings/{m['id']}")
    assert len(client.get("/api/action-items").json()) == before - 3


# ---- topics ---------------------------------------------------------------------

def test_topic_list_counts_meetings(client):
    topics = {t["name"]: t["meeting_count"] for t in client.get("/api/topics").json()}
    assert topics["planning"] == 2 and topics["hiring"] == 1


def test_tagging_is_normalised_and_idempotent(client):
    m = meeting(client)
    assert "launch plan" in client.put(f"/api/meetings/{m['id']}/topics/  Launch   PLAN ").json()
    again = client.put(f"/api/meetings/{m['id']}/topics/launch plan").json()
    assert again.count("launch plan") == 1
    assert client.get("/api/meetings?topic=launch plan").json()[0]["id"] == m["id"]


def test_untagging_and_unused_tags_drop_out_of_the_list(client):
    m = meeting(client, "Interview: Backend Engineer")
    assert client.delete(f"/api/meetings/{m['id']}/topics/hiring").status_code == 204
    assert "hiring" not in [t["name"] for t in client.get("/api/topics").json()]
    assert client.delete(f"/api/meetings/{m['id']}/topics/hiring").status_code == 204  # already gone is fine


def test_bad_topic_requests(client):
    m = meeting(client)
    assert client.put(f"/api/meetings/{m['id']}/topics/%20%20").status_code == 400
    assert client.put(f"/api/meetings/{m['id']}/topics/{'x' * 51}").status_code == 422
    assert client.put("/api/meetings/999/topics/a").status_code == 404
