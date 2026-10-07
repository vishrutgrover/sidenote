import pytest

from app.services.llm import base


def meeting(client, title="Weekly Product Sync"):
    return next(m for m in client.get("/api/meetings").json() if m["title"] == title)


def ask(client, mid, question, **extra):
    return client.post(f"/api/meetings/{mid}/ask", json={"question": question, **extra})


# ---- one meeting -------------------------------------------------------------------------

def test_answer_has_sources_that_point_at_real_lines(client):
    m = meeting(client)
    r = ask(client, m["id"], "What was decided about the export redesign?")
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "user" and body["assistant"]["role"] == "assistant"
    assert body["ai"] == {"provider": "mock", "model": "heuristic", "status": "ok", "error": None}
    src = body["assistant"]["sources"]
    assert src and all(s["meeting_id"] == m["id"] and s["meeting_title"] == m["title"] for s in src)
    lines = {l["id"]: l for l in client.get(f"/api/meetings/{m['id']}/transcript").json()}
    assert all(lines[s["segment_id"]]["start_sec"] == s["start_sec"] for s in src)


def test_history_is_kept_in_order_and_can_be_cleared(client):
    m = meeting(client)
    ask(client, m["id"], "first question here")
    ask(client, m["id"], "second question here")
    hist = client.get(f"/api/meetings/{m['id']}/chat").json()
    assert [h["role"] for h in hist] == ["user", "assistant", "user", "assistant"]
    assert hist[0]["content"] == "first question here" and hist[2]["content"] == "second question here"
    assert client.delete(f"/api/meetings/{m['id']}/chat").status_code == 204
    assert client.get(f"/api/meetings/{m['id']}/chat").json() == []


def test_each_meeting_has_its_own_chat(client):
    a, b = meeting(client), meeting(client, "Engineering Standup")
    ask(client, a["id"], "question for a meeting")
    assert client.get(f"/api/meetings/{b['id']}/chat").json() == []
    ask(client, b["id"], "question for b meeting")
    client.delete(f"/api/meetings/{a['id']}/chat")
    assert len(client.get(f"/api/meetings/{b['id']}/chat").json()) == 2


def test_summary_and_task_questions_get_real_answers(client):
    m = meeting(client)
    assert "search" in ask(client, m["id"], "Summarize this meeting").json()["assistant"]["content"].lower()
    tasks = ask(client, m["id"], "List my action items").json()["assistant"]["content"]
    assert "- [ ] Draft skip-button design" in tasks and "- [x] Ramp search rollout" in tasks


@pytest.mark.parametrize("body", [{}, {"question": ""}, {"question": "   "}, {"question": "x" * 1001}, {"question": 5}])
def test_bad_questions_are_422_and_store_nothing(client, body):
    m = meeting(client)
    assert client.post(f"/api/meetings/{m['id']}/ask", json=body).status_code == 422
    assert client.get(f"/api/meetings/{m['id']}/chat").json() == []


def test_unknown_meeting_is_404_for_all_three_endpoints(client):
    assert ask(client, 999, "hello there").status_code == 404
    assert client.get("/api/meetings/999/chat").status_code == 404
    assert client.delete("/api/meetings/999/chat").status_code == 404


def test_unavailable_provider_is_400_and_nothing_is_saved(client):
    m = meeting(client)
    r = ask(client, m["id"], "hello there", provider="anthropic")
    assert r.status_code == 400 and client.get(f"/api/meetings/{m['id']}/chat").json() == []


def test_chat_is_deleted_with_its_meeting(client):
    from app.db import SessionLocal
    from app.models import ChatMessage
    from sqlalchemy import func, select
    m = meeting(client)
    ask(client, m["id"], "will this be removed")
    client.delete(f"/api/meetings/{m['id']}")
    with SessionLocal() as db:
        assert db.scalar(select(func.count(ChatMessage.id))) == 0


# ---- real provider ------------------------------------------------------------------------------

def fake_claude(monkeypatch, text="The export redesign moves to the next sprint [01:48].", fail=None):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-secret")
    def post(url, headers, body, timeout=60.0):
        if fail:
            raise fail
        return {"content": [{"text": text}]}
    monkeypatch.setattr(base, "post_json", post)


def test_model_answer_is_stored_with_its_cited_line(client, monkeypatch):
    fake_claude(monkeypatch)
    m = meeting(client)
    r = ask(client, m["id"], "What happened to export?", provider="anthropic", model="claude-opus-5-5").json()
    assert r["assistant"]["content"].startswith("The export redesign") and r["assistant"]["model"] == "claude-opus-5-5"
    assert len(r["assistant"]["sources"]) == 1  # the one line whose time [01:48] the answer cites


def test_failed_model_call_still_answers_and_says_who(client, monkeypatch):
    fake_claude(monkeypatch, fail=base.LLMError("HTTP 429: rate limited"))
    m = meeting(client)
    r = ask(client, m["id"], "Who is on the standup?", provider="anthropic").json()
    assert r["ai"]["status"] == "fallback" and "429" in r["ai"]["error"]
    assert r["assistant"]["provider"] == "mock" and "sk-secret" not in str(r)


# ---- all meetings ----------------------------------------------------------------------------------

def test_global_question_draws_on_several_meetings(client):
    r = client.post("/api/ask", json={"question": "Who is worried about Safari or onboarding drop-off?"}).json()
    titles = {s["meeting_title"] for s in r["assistant"]["sources"]}
    assert {"Engineering Standup", "Weekly Product Sync"} <= titles
    assert r["assistant"]["meeting_id"] is None


def test_global_chat_is_separate_from_meeting_chats(client):
    m = meeting(client)
    ask(client, m["id"], "meeting level question")
    client.post("/api/ask", json={"question": "global level question"})
    assert [h["content"] for h in client.get("/api/chat").json() if h["role"] == "user"] == ["global level question"]
    client.delete("/api/chat")
    assert client.get("/api/chat").json() == [] and len(client.get(f"/api/meetings/{m['id']}/chat").json()) == 2


def test_global_task_question_lists_open_tasks_with_their_meeting(client):
    text = client.post("/api/ask", json={"question": "show my tasks"}).json()["assistant"]["content"]
    assert "Weekly Product Sync" in text and "[x]" not in text  # only open tasks


def test_global_question_with_no_match_says_so(client):
    text = client.post("/api/ask", json={"question": "zeppelin altitude regulations"}).json()["assistant"]["content"]
    assert "couldn't find" in text and "your meetings" in text


def test_sources_of_a_deleted_meeting_are_dropped_not_crashed_on(client):
    m = meeting(client, "Engineering Standup")
    client.post("/api/ask", json={"question": "Safari audio player bug"})
    client.delete(f"/api/meetings/{m['id']}")
    hist = client.get("/api/chat").json()
    assert all(s["meeting_id"] != m["id"] for h in hist for s in h["sources"])
