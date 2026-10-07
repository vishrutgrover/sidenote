import json

import pytest

from app.models import AiRun, User
from app.services import ai, ai_mock
from app.services.llm import base
from app.services.meetings import create_from_lines
from app.services.parser import parse

GOOD = {
    "overview": "They agreed to ship.",
    "keywords": ["shipping", "launch"],
    "sections": [{"title": "Plan", "bullets": [{"text": "Ship Friday", "line": 1}, {"text": "No line", "line": None}]}],
    "action_items": [{"assignee": "ben", "text": "Write release notes", "line": 1}, {"assignee": None, "text": "Book room", "line": 0}],
}
TRANSCRIPT = "[00:00:00] Ana: Let's plan the launch.\n[00:00:20] Ben: I'll write the release notes before Friday.\n[00:00:40] Ana: Great, can you also book a room?"


def make_meeting(db, text=TRANSCRIPT):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    return create_from_lines(db, user, "Launch", parse(text), "paste")


# ---- reading the model's reply ----------------------------------------------------

def test_parse_plain_json():
    assert ai.parse_summary(json.dumps(GOOD), 3)["overview"] == "They agreed to ship."


@pytest.mark.parametrize("wrap", ["```json\n{}\n```", "Sure! Here you go:\n{}\nHope that helps.", "  {}  "])
def test_parse_tolerates_fences_and_chatter(wrap):
    assert ai.parse_summary(wrap.replace("{}", json.dumps(GOOD)), 3)["keywords"] == ["shipping", "launch"]


def test_line_numbers_outside_the_transcript_become_none():
    data = json.loads(json.dumps(GOOD))
    data["sections"][0]["bullets"][0]["line"] = 99
    data["action_items"][0]["line"] = -1
    out = ai.parse_summary(json.dumps(data), 3)
    assert out["sections"][0]["bullets"][0]["line"] is None and out["action_items"][0]["line"] is None


def test_oversized_replies_are_trimmed():
    data = dict(GOOD, keywords=[f"k{i}" for i in range(50)], action_items=[{"text": f"t{i}"} for i in range(50)])
    out = ai.parse_summary(json.dumps(data), 3)
    assert len(out["keywords"]) == 10 and len(out["action_items"]) == 20


@pytest.mark.parametrize("raw", [
    "", "no json here", "{broken", "[]", "{}",
    json.dumps({**GOOD, "overview": "   "}),
    json.dumps({**GOOD, "sections": "nope"}),
    json.dumps({**GOOD, "sections": [{"title": "", "bullets": []}]}),
    json.dumps({**GOOD, "sections": [{"title": "T", "bullets": [{"text": 5}]}]}),
])
def test_unusable_replies_are_rejected(raw):
    with pytest.raises((ValueError, KeyError, TypeError)):
        ai.parse_summary(raw, 3)


# ---- built-in notes ------------------------------------------------------------------

LINES = [("Ana", 0.0, "Let's plan the launch carefully."), ("Ben", 20.0, "I'll write the release notes before Friday."),
         ("Ana", 40.0, "Can you also book a room for the launch?")]


def test_mock_summary_shape():
    out = ai_mock.summarize(LINES)
    assert out["overview"].startswith("2 participants discussed") and "launch" in out["keywords"]
    assert 1 <= len(out["sections"]) <= 3
    assert all(0 <= b["line"] < 3 for s in out["sections"] for b in s["bullets"])


def test_mock_action_items_assign_only_self_commitments():
    items = ai_mock.summarize(LINES)["action_items"]
    by_line = {i["line"]: i["assignee"] for i in items}
    assert by_line[1] == "Ben" and by_line[2] is None


@pytest.mark.parametrize("lines", [[("A", 0.0, "Hi")], [("A", 0.0, "a")] * 7, [("A", 0.0, "!!! ???")]])
def test_mock_summary_handles_tiny_and_odd_transcripts(lines):
    out = ai_mock.summarize(lines)
    assert out["overview"] and out["sections"]


# ---- writing notes to the database ---------------------------------------------------

def test_apply_notes_saves_sections_with_timestamps_and_assignees(db):
    m = make_meeting(db)
    ai.apply_notes(db, m, ai.parse_summary(json.dumps(GOOD), 3))
    assert m.summary.overview == "They agreed to ship."
    bullets = m.sections[0].bullets
    assert [(b.text, b.timestamp_sec) for b in bullets] == [("Ship Friday", 20.0), ("No line", None)]
    items = {a.text: a for a in m.action_items}
    assert items["Write release notes"].assignee.person.name == "Ben"  # matched case-insensitively
    assert items["Book room"].assignee is None


def test_applying_notes_again_replaces_sections_but_keeps_existing_tasks(db):
    m = make_meeting(db)
    parsed = ai.parse_summary(json.dumps(GOOD), 3)
    ai.apply_notes(db, m, parsed)
    task = next(a for a in m.action_items if a.text == "Book room")
    task.is_done = True
    db.commit()
    ai.apply_notes(db, m, parsed)
    assert len(m.sections) == 1 and len(m.sections[0].bullets) == 2
    assert [a.text for a in m.action_items].count("Book room") == 1
    assert next(a for a in m.action_items if a.text == "Book room").is_done is True


def test_tags_are_suggested_only_when_there_are_none(db):
    m = make_meeting(db)
    ai.apply_notes(db, m, ai.parse_summary(json.dumps(GOOD), 3))
    assert [t.name for t in m.topics] == ["shipping", "launch"]
    ai.apply_notes(db, m, ai.parse_summary(json.dumps(dict(GOOD, keywords=["other"])), 3))
    assert [t.name for t in m.topics] == ["shipping", "launch"]


# ---- the call wrapper: logging and fallback --------------------------------------------

def test_builtin_provider_never_touches_the_network(db, monkeypatch):
    monkeypatch.setattr(base, "post_json", lambda *a, **k: pytest.fail("network used"))
    m = make_meeting(db)
    info = ai.generate_notes(db, m)
    assert (info["provider"], info["status"]) == ("mock", "ok") and m.summary.overview


def test_a_working_provider_is_used_and_logged(db, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(base, "post_json", lambda *a, **k: {"content": [{"text": json.dumps(GOOD)}]})
    m = make_meeting(db)
    info = ai.generate_notes(db, m)
    assert (info["provider"], info["model"], info["status"]) == ("anthropic", "claude-sonnet-5-5", "ok")
    assert m.summary.overview == "They agreed to ship."
    run = db.query(AiRun).one()
    assert (run.task, run.provider, run.status, run.error) == ("summarize", "anthropic", "ok", None)


@pytest.mark.parametrize("failure", [
    lambda *a, **k: (_ for _ in ()).throw(base.LLMError("HTTP 500")),
    lambda *a, **k: {"content": [{"text": "I cannot do that"}]},       # reply is not JSON
    lambda *a, **k: {"content": [{"text": json.dumps({"overview": ""})}]},  # JSON but unusable
    lambda *a, **k: {"surprise": 1},                                     # wrong response shape
])
def test_any_provider_failure_falls_back_to_builtin_notes(db, monkeypatch, failure):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(base, "post_json", failure)
    m = make_meeting(db)
    info = ai.generate_notes(db, m)
    assert info["status"] == "fallback" and info["error"]
    assert m.summary.overview and m.sections  # notes exist anyway
    assert db.query(AiRun).one().status == "fallback"


def test_long_transcripts_are_cut_before_sending():
    lines = [("A", float(i), "word " * 50) for i in range(2000)]
    assert len(ai.transcript_prompt(lines)) == ai.MAX_PROMPT_CHARS


def test_clock_format():
    assert ai.clock(0) == "00:00" and ai.clock(83.9) == "01:23" and ai.clock(3725) == "62:05"
