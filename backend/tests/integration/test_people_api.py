import pytest


def person(client, name):
    return next(p for p in client.get("/api/people").json() if p["name"] == name)


def test_list_is_busiest_first_and_marks_me(client):
    people = client.get("/api/people").json()
    assert people[0]["name"] == "Vishrut Grover" and people[0]["meeting_count"] == 6 and people[0]["is_me"]
    assert [p["meeting_count"] for p in people] == sorted((p["meeting_count"] for p in people), reverse=True)
    assert sum(p["is_me"] for p in people) == 1
    assert len({p["name"] for p in people}) == len(people)  # one row per human, however many meetings


def test_search_by_name_or_email_with_wildcards_treated_literally(client):
    assert [p["name"] for p in client.get("/api/people", params={"q": "maya"}).json()] == ["Maya Chen"]
    assert [p["name"] for p in client.get("/api/people", params={"q": "priya.nair@"}).json()] == ["Priya Nair"]
    assert client.get("/api/people", params={"q": "%"}).json() == []
    assert client.get("/api/people", params={"q": "nobody here"}).json() == []


def test_profile_lists_their_meetings_newest_first(client):
    maya = person(client, "Maya Chen")
    d = client.get(f"/api/people/{maya['id']}").json()
    assert d["meeting_count"] == 3
    assert [m["title"] for m in d["meetings"]] == ["Weekly Product Sync", "Design Review: Onboarding Flow", "Q4 Roadmap Planning"]


def test_talk_time_matches_the_transcripts(client):
    maya = person(client, "Maya Chen")
    expected, words = {}, 0
    for m in client.get("/api/meetings").json():
        for line in client.get(f"/api/meetings/{m['id']}/transcript").json():
            if line["speaker"] and line["speaker"]["person_id"] == maya["id"]:
                expected[m["id"]] = expected.get(m["id"], 0) + line["end_sec"] - line["start_sec"]
                words += len(line["text"].split())
    d = client.get(f"/api/people/{maya['id']}").json()
    assert d["total_talk_sec"] == pytest.approx(sum(expected.values()), abs=0.2)
    assert {m["id"]: m["talk_sec"] for m in d["meetings"]} == pytest.approx(expected, abs=0.2)
    assert d["wpm"] == round(words / (sum(expected.values()) / 60))


def test_share_of_each_meeting_is_between_0_and_100_and_adds_up(client):
    for p in client.get("/api/people").json():
        for m in client.get(f"/api/people/{p['id']}").json()["meetings"]:
            assert 0 <= m["share_pct"] <= 100
    sync = next(m for m in client.get("/api/meetings").json() if m["title"] == "Weekly Product Sync")
    total = sum(next(x for x in client.get(f"/api/people/{p['id']}").json()["meetings"] if x["id"] == sync["id"])["share_pct"]
                for p in client.get("/api/people").json() if p["name"] in {"Vishrut Grover", "Maya Chen", "Arjun Rao"})
    assert 98 <= total <= 102


def test_open_tasks_exclude_finished_ones(client):
    maya = person(client, "Maya Chen")
    tasks = client.get(f"/api/people/{maya['id']}").json()["open_tasks"]
    assert {t["text"] for t in tasks} >= {"Draft skip-button design and new permission copy", "Test shorter permission text with five users"}
    assert not any(t["is_done"] for t in tasks) and all(t["assignee"]["person_id"] == maya["id"] for t in tasks)
    arjun = person(client, "Arjun Rao")
    assert "Ramp search rollout to 80 percent and monitor error rates" not in [t["text"] for t in client.get(f"/api/people/{arjun['id']}").json()["open_tasks"]]


def test_ticking_a_task_removes_it_from_their_profile(client):
    maya = person(client, "Maya Chen")
    task = client.get(f"/api/people/{maya['id']}").json()["open_tasks"][0]
    client.patch(f"/api/action-items/{task['id']}", json={"is_done": True})
    assert task["id"] not in [t["id"] for t in client.get(f"/api/people/{maya['id']}").json()["open_tasks"]]


def test_deleting_a_meeting_updates_the_profile(client):
    maya = person(client, "Maya Chen")
    sync = next(m for m in client.get("/api/meetings").json() if m["title"] == "Weekly Product Sync")
    client.delete(f"/api/meetings/{sync['id']}")
    d = client.get(f"/api/people/{maya['id']}").json()
    assert d["meeting_count"] == 2 and sync["id"] not in [m["id"] for m in d["meetings"]]


def test_someone_who_never_spoke_has_an_empty_profile(client):
    from app.db import SessionLocal
    from app.models import Person
    with SessionLocal() as db:
        p = Person(name="Quiet Person", email="quiet@example.com")
        db.add(p)
        db.commit()
        pid = p.id
    d = client.get(f"/api/people/{pid}").json()
    assert (d["meeting_count"], d["total_talk_sec"], d["wpm"], d["meetings"], d["open_tasks"]) == (0, 0, 0, [], [])


def test_unknown_person_is_404(client):
    assert client.get("/api/people/99999").status_code == 404
    assert client.get("/api/people/abc").status_code == 422


# ---- people who are in no meeting any more ---------------------------------------

PASTE = "Zed Zimmer: hello there\nYuri Yates: hi Zed"


def names(client):
    return {p["name"] for p in client.get("/api/people").json()}


def test_deleting_a_meeting_removes_people_who_were_only_in_it(client):
    m = client.post("/api/meetings", data={"transcript": PASTE}).json()
    assert {"Zed Zimmer", "Yuri Yates"} <= names(client)
    client.delete(f"/api/meetings/{m['id']}")
    assert not ({"Zed Zimmer", "Yuri Yates"} & names(client))


def test_sample_people_are_all_still_there_after_a_delete(client):
    before = names(client)
    m = client.post("/api/meetings", data={"transcript": PASTE}).json()
    client.delete(f"/api/meetings/{m['id']}")
    assert names(client) == before


def test_people_who_are_in_another_meeting_are_kept(client):
    a = client.post("/api/meetings", data={"transcript": PASTE}).json()
    b = client.post("/api/meetings", data={"transcript": "Zed Zimmer: second meeting"}).json()
    client.delete(f"/api/meetings/{a['id']}")
    assert "Zed Zimmer" in names(client) and "Yuri Yates" not in names(client)
    client.delete(f"/api/meetings/{b['id']}")
    assert "Zed Zimmer" not in names(client)


def test_removing_someone_from_a_meeting_removes_them_too_if_it_was_their_only_one(client):
    m = client.post("/api/meetings", data={"transcript": PASTE}).json()
    client.patch(f"/api/meetings/{m['id']}", json={"participants": ["Zed Zimmer"]})
    assert "Yuri Yates" not in names(client) and "Zed Zimmer" in names(client)


def test_the_logged_in_person_is_never_removed_even_with_no_meetings(client):
    for m in client.get("/api/meetings").json():
        client.delete(f"/api/meetings/{m['id']}")
    assert names(client) == {"Vishrut Grover"}
    assert client.get("/api/people").json()[0]["is_me"] is True
    assert client.get("/api/me").json()["person_id"] == client.get("/api/people").json()[0]["id"]


def test_a_removed_person_has_no_profile(client):
    m = client.post("/api/meetings", data={"transcript": PASTE}).json()
    pid = next(p["id"] for p in client.get("/api/people").json() if p["name"] == "Zed Zimmer")
    client.delete(f"/api/meetings/{m['id']}")
    assert client.get(f"/api/people/{pid}").status_code == 404
