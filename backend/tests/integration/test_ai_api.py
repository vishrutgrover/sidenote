import json

import pytest

from app.services.llm import base

REPLY = {
    "overview": "Model written overview.",
    "keywords": ["alpha", "beta"],
    "sections": [{"title": "Decisions", "bullets": [{"text": "Ship it", "line": 2}]}],
    "action_items": [{"assignee": "Maya Chen", "text": "Draft the announcement", "line": 3}],
}


def fake_anthropic(monkeypatch, reply=REPLY, fail=None):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-secret")
    def post(url, headers, body, timeout=60.0):
        if fail:
            raise fail
        return {"content": [{"text": json.dumps(reply)}]}
    monkeypatch.setattr(base, "post_json", post)


def first(client):
    return client.get("/api/meetings").json()[0]


# ---- available models ------------------------------------------------------------------

def test_models_without_keys_lists_only_the_builtin_provider(client):
    r = client.get("/api/llm/models").json()
    assert r["default_provider"] == "mock" and [p["name"] for p in r["providers"]] == ["mock"]


def test_models_lists_configured_providers_and_never_leaks_keys(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-secret")
    monkeypatch.setenv("GROQ_API_KEY", "gsk-secret")
    r = client.get("/api/llm/models")
    assert [p["name"] for p in r.json()["providers"]] == ["anthropic", "groq", "mock"]
    assert r.json()["default_provider"] == "anthropic"
    assert "secret" not in r.text


def test_a_typo_in_the_default_provider_does_not_break_the_app(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")  # no key for it
    assert client.get("/api/llm/models").json()["default_provider"] == "mock"
    assert client.post("/api/meetings", data={"transcript": "Ana: hi there"}).status_code == 201


# ---- regenerate ---------------------------------------------------------------------------

def test_regenerate_with_the_builtin_provider(client):
    m = first(client)
    r = client.post(f"/api/meetings/{m['id']}/summary/regenerate")
    assert r.status_code == 200
    assert r.json()["ai"] == {"provider": "mock", "model": "heuristic", "status": "ok", "error": None}
    assert 1 <= len(r.json()["sections"]) <= 3


def test_regenerate_with_a_real_provider_writes_its_notes(client, monkeypatch):
    fake_anthropic(monkeypatch)
    m = first(client)
    r = client.post(f"/api/meetings/{m['id']}/summary/regenerate", json={"provider": "anthropic", "model": "claude-opus-5-5"}).json()
    assert r["ai"]["model"] == "claude-opus-5-5" and r["overview"] == "Model written overview."
    assert r["sections"][0]["bullets"][0]["timestamp_sec"] is not None  # line 2 mapped to a real time
    tasks = client.get(f"/api/meetings/{m['id']}/action-items").json()
    assert any(t["text"] == "Draft the announcement" and t["assignee"]["name"] == "Maya Chen" for t in tasks)


def test_a_failing_provider_falls_back_and_says_so(client, monkeypatch):
    fake_anthropic(monkeypatch, fail=base.LLMError("HTTP 401: bad key"))
    m = first(client)
    r = client.post(f"/api/meetings/{m['id']}/summary/regenerate", json={"provider": "anthropic"})
    assert r.status_code == 200 and r.json()["ai"]["status"] == "fallback" and "401" in r.json()["ai"]["error"]
    assert r.json()["overview"] and "sk-secret" not in r.text


def test_regenerate_keeps_ticked_tasks_and_adds_no_duplicates(client):
    m = first(client)
    items = client.get(f"/api/meetings/{m['id']}/action-items").json()
    client.patch(f"/api/action-items/{items[0]['id']}", json={"is_done": True})
    for _ in range(2):
        client.post(f"/api/meetings/{m['id']}/summary/regenerate")
    after = client.get(f"/api/meetings/{m['id']}/action-items").json()
    texts = [a["text"].casefold() for a in after]
    assert len(texts) == len(set(texts))
    assert next(a for a in after if a["id"] == items[0]["id"])["is_done"] is True


@pytest.mark.parametrize("body", [{"provider": "nonsense"}, {"provider": "anthropic"}])  # unknown, and known but no key
def test_regenerate_with_an_unavailable_provider_is_a_400(client, body):
    m = first(client)
    r = client.post(f"/api/meetings/{m['id']}/summary/regenerate", json=body)
    assert r.status_code == 400 and "not available" in r.json()["detail"]


def test_regenerate_unknown_meeting_is_404(client):
    assert client.post("/api/meetings/999/summary/regenerate").status_code == 404


# ---- uploads get notes automatically ----------------------------------------------------------

TEXT = "[00:00:00] Ana: Let's plan the launch.\n[00:00:20] Ben: I'll write the release notes before Friday.\n[00:00:40] Ana: Can you also book a room?"


def test_new_meeting_is_processing_then_ready_with_notes_tasks_and_tags(client):
    m = client.post("/api/meetings", data={"transcript": TEXT}).json()
    assert m["status"] == "processing"
    done = client.get(f"/api/meetings/{m['id']}").json()
    assert done["status"] == "ready" and done["overview"] and done["topics"]
    tasks = client.get(f"/api/meetings/{m['id']}/action-items").json()
    assert any(t["assignee"] and t["assignee"]["name"] == "Ben" for t in tasks)


def test_upload_can_choose_its_provider(client, monkeypatch):
    fake_anthropic(monkeypatch)
    m = client.post("/api/meetings", data={"transcript": TEXT, "provider": "anthropic"}).json()
    assert client.get(f"/api/meetings/{m['id']}").json()["overview"] == "Model written overview."


def test_upload_with_an_unavailable_provider_is_rejected_before_anything_is_created(client):
    r = client.post("/api/meetings", data={"transcript": TEXT, "provider": "openai"})
    assert r.status_code == 400 and len(client.get("/api/meetings").json()) == 6


def test_upload_survives_a_provider_outage(client, monkeypatch):
    fake_anthropic(monkeypatch, fail=base.LLMError("HTTP 503"))
    m = client.post("/api/meetings", data={"transcript": TEXT}).json()
    done = client.get(f"/api/meetings/{m['id']}").json()
    assert done["status"] == "ready" and done["overview"]  # built-in notes took over


def test_unexpected_crash_while_processing_marks_the_meeting_failed(client, monkeypatch):
    from app.services import ai
    monkeypatch.setattr(ai, "generate_notes", lambda *a, **k: 1 / 0)
    m = client.post("/api/meetings", data={"transcript": TEXT}).json()
    assert client.get(f"/api/meetings/{m['id']}").json()["status"] == "failed"


def test_processing_a_meeting_deleted_in_the_meantime_does_nothing(client):
    from app.services import ai
    assert ai.process_meeting(999999, None, None) is None


# ---- the run log ---------------------------------------------------------------------------------

def test_every_call_is_logged_newest_first(client, monkeypatch):
    m = first(client)
    client.post(f"/api/meetings/{m['id']}/summary/regenerate")
    fake_anthropic(monkeypatch, fail=base.LLMError("boom"))
    client.post(f"/api/meetings/{m['id']}/summary/regenerate", json={"provider": "anthropic"})
    runs = client.get("/api/ai-runs").json()
    assert [(r["provider"], r["status"]) for r in runs[:2]] == [("anthropic", "fallback"), ("mock", "ok")]
    assert runs[0]["error"] and runs[0]["latency_ms"] >= 0 and "secret" not in json.dumps(runs)


def test_run_log_survives_meeting_deletion_and_validates_limit(client):
    m = first(client)
    client.post(f"/api/meetings/{m['id']}/summary/regenerate")
    client.delete(f"/api/meetings/{m['id']}")
    assert client.get("/api/ai-runs").json()[0]["meeting_id"] is None
    assert client.get("/api/ai-runs?limit=0").status_code == 422
    assert client.get("/api/ai-runs?limit=201").status_code == 422
