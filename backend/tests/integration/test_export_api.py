import json

import pytest

FORMATS = {"pdf": "application/pdf", "md": "text/markdown", "txt": "text/plain", "json": "application/json",
           "srt": "application/x-subrip", "csv": "text/csv"}


def first(client):
    return client.get("/api/meetings").json()[0]


@pytest.mark.parametrize("fmt", FORMATS)
def test_every_transcript_format_downloads(client, fmt):
    m = first(client)
    r = client.get(f"/api/meetings/{m['id']}/export", params={"what": "transcript", "format": fmt})
    assert r.status_code == 200 and r.headers["content-type"].startswith(FORMATS[fmt])
    assert r.headers["content-disposition"] == f'attachment; filename="weekly-product-sync-transcript.{fmt}"'
    assert len(r.content) > 200


@pytest.mark.parametrize("fmt", ["pdf", "md", "json"])
def test_every_summary_format_downloads(client, fmt):
    m = first(client)
    r = client.get(f"/api/meetings/{m['id']}/export", params={"what": "summary", "format": fmt})
    assert r.status_code == 200 and r.headers["content-disposition"].endswith(f'summary.{fmt}"')


def test_summary_content_matches_the_notes_page(client):
    m = first(client)
    d = client.get(f"/api/meetings/{m['id']}/export", params={"what": "summary", "format": "json"}).json()
    page = client.get(f"/api/meetings/{m['id']}/summary").json()
    assert d["overview"] == page["overview"] and [s["title"] for s in d["sections"]] == [s["title"] for s in page["sections"]]
    assert set(d["action_items"]) == {"Maya Chen", "Arjun Rao"}


def test_options_switch_speakers_and_timestamps_off(client):
    m = first(client)
    url = f"/api/meetings/{m['id']}/export"
    plain = client.get(url, params={"what": "transcript", "format": "txt", "timestamps": False, "speakers": False}).text
    assert plain.startswith("Thanks for joining everyone")
    full = client.get(url, params={"what": "transcript", "format": "txt"}).text
    assert full.startswith("[00:00] Vishrut Grover: Thanks for joining")


@pytest.mark.parametrize("params", [
    {"what": "summary", "format": "srt"}, {"what": "summary", "format": "csv"}, {"what": "summary", "format": "txt"},
    {"what": "transcript", "format": "docx"}, {"what": "notes", "format": "md"}, {"what": "transcript"}, {"format": "md"}, {},
])
def test_unsupported_or_missing_choices_are_422(client, params):
    assert client.get(f"/api/meetings/{first(client)['id']}/export", params=params).status_code == 422


def test_unknown_meeting_is_404(client):
    assert client.get("/api/meetings/999/export", params={"what": "transcript", "format": "md"}).status_code == 404


def test_export_of_a_hostile_title_and_text_is_safe(client):
    m = client.post("/api/meetings", data={"title": 'x"; filename="evil\r\nSet-Cookie: a=b', "transcript": "A: =HYPERLINK(\"http://x\") <b>"}).json()
    r = client.get(f"/api/meetings/{m['id']}/export", params={"what": "transcript", "format": "csv"})
    assert "\n" not in r.headers["content-disposition"] and "Set-Cookie" not in r.headers
    assert "'=HYPERLINK" in r.text
    assert client.get(f"/api/meetings/{m['id']}/export", params={"what": "transcript", "format": "pdf"}).content.startswith(b"%PDF")


def test_json_export_is_valid_json_for_every_seed_meeting(client):
    for m in client.get("/api/meetings").json():
        json.loads(client.get(f"/api/meetings/{m['id']}/export", params={"what": "transcript", "format": "json"}).text)
