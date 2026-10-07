def meeting(client, title="Weekly Product Sync"):
    return next(m for m in client.get("/api/meetings").json() if m["title"] == title)


def test_every_sample_meeting_has_a_recording_that_can_be_downloaded(client):
    for m in client.get("/api/meetings").json():
        assert m["media_url"] and m["media_url"].startswith("/media/") and m["media_url"].endswith(".mp3")
        r = client.get(m["media_url"])
        assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and len(r.content) > 100_000


def test_recording_length_matches_the_stored_duration(client):
    import subprocess
    from app.seed import MEDIA_DIR
    for m in client.get("/api/meetings").json():
        path = MEDIA_DIR / m["media_url"].split("/")[-1]
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
        if out.returncode == 0:  # ffprobe is optional on the machine running the tests
            assert abs(float(out.stdout) - m["duration_sec"]) < 1.5


def test_players_can_seek_because_byte_ranges_are_supported(client):
    url = meeting(client)["media_url"]
    r = client.get(url, headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100
    assert r.headers["content-range"].startswith("bytes 0-99/")
    assert r.headers["accept-ranges"] == "bytes"
    assert client.get(url, headers={"Range": "bytes=999999999-"}).status_code == 416


def test_missing_files_and_path_tricks_are_404(client):
    assert client.get("/media/nope.mp3").status_code == 404
    assert client.get("/media/../app/main.py").status_code == 404
    assert client.get("/media/%2e%2e/app/main.py").status_code == 404
    assert client.get("/media/").status_code in (404, 405)


def test_uploaded_meetings_have_no_recording(client):
    m = client.post("/api/meetings", data={"transcript": "Ana: no audio here"}).json()
    assert m["media_url"] is None
