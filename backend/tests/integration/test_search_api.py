import pytest


def first_meeting(client, title):
    return next(m for m in client.get("/api/meetings").json() if m["title"] == title)


# ---- transcript -------------------------------------------------------------

def test_transcript_is_in_time_order_with_speakers(client):
    m = first_meeting(client, "Weekly Product Sync")
    lines = client.get(f"/api/meetings/{m['id']}/transcript").json()
    assert len(lines) == 12
    assert [l["start_sec"] for l in lines] == sorted(l["start_sec"] for l in lines)
    assert lines[0]["speaker"]["name"] == "Vishrut Grover" and lines[0]["speaker"]["color"]
    assert not any(l["match"] for l in lines)


def test_transcript_flags_matching_lines_only(client):
    m = first_meeting(client, "Weekly Product Sync")
    lines = client.get(f"/api/meetings/{m['id']}/transcript", params={"q": "onboarding"}).json()
    flagged = [l for l in lines if l["match"]]
    assert 1 <= len(flagged) < len(lines)
    assert all("onboarding" in l["text"].lower() for l in flagged)
    assert len(lines) == 12  # nothing is filtered out, only flagged


def test_transcript_search_stays_inside_the_meeting(client):
    m = first_meeting(client, "Interview: Backend Engineer")
    lines = client.get(f"/api/meetings/{m['id']}/transcript", params={"q": "onboarding"}).json()
    assert not any(l["match"] for l in lines)


@pytest.mark.parametrize("q", ['"', "*", "AND", "(", "a'--", "%", "   "])
def test_transcript_search_survives_odd_input(client, q):
    m = first_meeting(client, "Weekly Product Sync")
    assert client.get(f"/api/meetings/{m['id']}/transcript", params={"q": q}).status_code == 200


def test_transcript_of_unknown_meeting_is_404(client):
    assert client.get("/api/meetings/999/transcript").status_code == 404


# ---- editing a line ---------------------------------------------------------

def test_edited_line_is_found_by_its_new_words_only(client):
    m = first_meeting(client, "Weekly Product Sync")
    line = client.get(f"/api/meetings/{m['id']}/transcript").json()[0]
    r = client.patch(f"/api/segments/{line['id']}", json={"text": "  Zebra crossing opens today  "})
    assert r.status_code == 200 and r.json()["text"] == "Zebra crossing opens today"
    assert [x["meeting"]["id"] for x in client.get("/api/search", params={"q": "zebra"}).json()] == [m["id"]]
    assert client.get("/api/search", params={"q": "thanks for joining everyone"}).json() == []


@pytest.mark.parametrize("body", [{"text": ""}, {"text": "   "}, {"text": "x" * 5001}, {}])
def test_bad_edits_are_rejected(client, body):
    m = first_meeting(client, "Weekly Product Sync")
    line = client.get(f"/api/meetings/{m['id']}/transcript").json()[0]
    assert client.patch(f"/api/segments/{line['id']}", json=body).status_code == 422


def test_editing_a_missing_line_is_404(client):
    assert client.patch("/api/segments/99999", json={"text": "x"}).status_code == 404


# ---- global search ------------------------------------------------------------

def test_global_search_groups_hits_by_meeting(client):
    r = client.get("/api/search", params={"q": "search"}).json()
    assert r and all(x["hit_count"] >= 1 for x in r if not x["title_match"])
    for x in r:
        assert len(x["hits"]) <= 3 and x["hit_count"] >= len(x["hits"])
        assert all(h["match"] for h in x["hits"])


def test_global_search_finds_title_and_participant_matches_without_transcript_hits(client):
    r = client.get("/api/search", params={"q": "acme"}).json()
    assert r[0]["meeting"]["title"] == "Customer Call: Acme Logistics" and r[0]["title_match"]
    r = client.get("/api/search", params={"q": "Okafor"}).json()  # a participant, not in any title
    assert {x["meeting"]["title"] for x in r} >= {"Customer Call: Acme Logistics", "Q4 Roadmap Planning"}


def test_title_only_skips_transcripts(client):
    with_text = client.get("/api/search", params={"q": "pilot"}).json()
    assert with_text and client.get("/api/search", params={"q": "pilot", "title_only": True}).json() == []


def test_global_search_sort_order(client):
    recent = [x["meeting"]["title"] for x in client.get("/api/search", params={"q": "the"}).json()]
    oldest = [x["meeting"]["title"] for x in client.get("/api/search", params={"q": "the", "sort": "oldest"}).json()]
    assert len(recent) > 1 and recent == oldest[::-1]


@pytest.mark.parametrize("params", [{}, {"q": ""}, {"q": "x" * 201}, {"q": "a", "sort": "sideways"}])
def test_global_search_validates_input(client, params):
    assert client.get("/api/search", params=params).status_code == 422


@pytest.mark.parametrize("q", ['"', "*", "AND", "(", "a'; DROP TABLE meetings;--", "%", "☕"])
def test_global_search_survives_odd_input(client, q):
    assert client.get("/api/search", params={"q": q}).status_code == 200
    assert len(client.get("/api/meetings").json()) == 6


def test_deleted_meetings_disappear_from_search(client):
    m = first_meeting(client, "Customer Call: Acme Logistics")
    assert client.get("/api/search", params={"q": "dispatchers"}).json()
    client.delete(f"/api/meetings/{m['id']}")
    assert client.get("/api/search", params={"q": "dispatchers"}).json() == []


def test_new_meeting_is_searchable_right_away(client):
    client.post("/api/meetings", data={"transcript": "Ana: The quokka launch is on Monday"})
    r = client.get("/api/search", params={"q": "quokka"}).json()
    assert len(r) == 1 and r[0]["hits"][0]["speaker"]["name"] == "Ana"
