import json

import pytest

from app.models import ChatMessage, User
from app.services import chat
from app.services.llm import base
from app.services.llm.registry import ProviderUnavailable
from app.services.meetings import create_from_lines
from app.services.parser import parse
from app.services.search import top_segments

TEXT = (
    "[00:00:00] Ana: We will launch the pricing page on Friday.\n"
    "[00:00:30] Ben: The budget for the campaign is tight this quarter.\n"
    "[00:01:05] Ana: I'll write the announcement before Friday."
)


@pytest.fixture
def m(db):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    return create_from_lines(db, user, "Launch", parse(TEXT), "paste")


# ---- finding the right lines ---------------------------------------------------------

def test_retrieval_matches_any_meaningful_word_and_ranks_by_relevance(db, m):
    hits = top_segments(db, "When do we launch the pricing page?", m.id)
    assert hits[0].text.startswith("We will launch the pricing page")  # reading order, best match included
    assert top_segments(db, "campaign budget") [0].text.startswith("The budget")


@pytest.mark.parametrize("q", ["", "the and of", "?!", "☕", '"', "AND OR", "NEAR("])
def test_retrieval_with_no_usable_words_returns_nothing_and_never_raises(db, m, q):
    assert top_segments(db, q, m.id) == []


def test_retrieval_respects_the_limit_and_scope(db, m):
    assert len(top_segments(db, "Friday", m.id, limit=1)) == 1
    assert top_segments(db, "Friday", meeting_id=12345) == []


# ---- citations -----------------------------------------------------------------------------

def test_cited_times_map_to_the_line_that_was_playing(db, m):
    ids = chat.cited_line_ids(m, "Pricing launches [00:02] and the budget is tight [00:31], see also [00:31].")
    assert [s.text[:6] for s in m.segments if s.id in ids] == ["We wil", "The bu"]  # 00:02 falls inside line 1; no duplicates


def test_a_citation_covers_the_whole_second_it_shows(db, m):
    # lines are shown by their start time rounded down: a line starting at 98.9 s is displayed as 01:38
    m.segments[1].start_sec = 98.9
    m.segments[2].start_sec = 130.0
    db.commit()
    ids = chat.cited_line_ids(m, "He said it at [01:38].")
    assert ids == [m.segments[1].id]


def test_citations_that_match_no_line_are_ignored(db, m):
    assert chat.cited_line_ids(m, "nothing [99:99] or [bad] here") == [m.segments[-1].id]  # 99:99 is after the last line start
    assert chat.cited_line_ids(m, "no references at all") == []


# ---- built-in answers --------------------------------------------------------------------

def test_builtin_answer_quotes_matching_lines_with_time_and_speaker(db, m):
    text, ids = chat.builtin_answer(db, m, "Who writes the announcement?")
    assert "[01:05] Ana: I'll write the announcement" in text and len(ids) >= 1


def test_builtin_answer_says_so_when_nothing_matches(db, m):
    text, ids = chat.builtin_answer(db, m, "zeppelin altitude")
    assert "couldn't find" in text and "this meeting" in text and ids == []
    assert "your meetings" in chat.builtin_answer(db, None, "zeppelin altitude")[0]


def test_builtin_answer_recognises_summary_and_task_questions(db, m):
    assert "no notes" in chat.builtin_answer(db, m, "Give me a summary")[0]
    assert chat.builtin_answer(db, m, "what are my action items?")[0] == "There are no action items."
    from app.models import ActionItem
    db.add(ActionItem(meeting_id=m.id, text="Book room", is_done=True))
    db.commit()
    db.refresh(m)
    assert "- [x] Book room" in chat.builtin_answer(db, m, "list the todos")[0]


# ---- ask(): storage, history, prompts, failure -------------------------------------------------

def test_ask_stores_both_messages_with_sources_and_author(db, m):
    user, bot, info = chat.ask(db, m, "When is the pricing launch?", None, None)
    assert (user.role, bot.role, bot.provider, bot.model) == ("user", "assistant", "mock", "heuristic")
    assert json.loads(bot.sources) and info["status"] == "ok"
    assert db.query(ChatMessage).count() == 2


def test_unavailable_provider_stores_nothing(db, m):
    with pytest.raises(ProviderUnavailable):
        chat.ask(db, m, "hi there", "openai", None)
    assert db.query(ChatMessage).count() == 0


def test_llm_prompt_has_transcript_history_and_question(db, m, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    seen = []
    monkeypatch.setattr(base, "post_json", lambda url, headers, body, timeout=60.0: seen.append(body) or {"content": [{"text": "It is Friday [00:02]."}]})
    chat.ask(db, m, "When is the launch?", None, None)
    user, bot, _ = chat.ask(db, m, "And who announces it?", None, None)
    first, second = seen
    assert "[00:30] Ben: The budget" in first["messages"][0]["content"] and "Conversation so far" not in first["messages"][0]["content"]
    assert "user: When is the launch?" in second["messages"][0]["content"] and "assistant: It is Friday" in second["messages"][0]["content"]
    assert second["messages"][0]["content"].endswith("Question: And who announces it?")
    assert "using only the transcript" in second["system"]
    assert json.loads(bot.sources) == [m.segments[0].id] and bot.provider == "anthropic"


def test_history_sent_to_the_model_is_capped(db, m, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    seen = []
    monkeypatch.setattr(base, "post_json", lambda url, headers, body, timeout=60.0: seen.append(body) or {"content": [{"text": "ok"}]})
    for i in range(10):
        chat.ask(db, m, f"question number {i}", None, None)
    prompt = seen[-1]["messages"][0]["content"]
    assert prompt.count("user: question number") == chat.HISTORY_TURNS // 2 and "question number 0" not in prompt


@pytest.mark.parametrize("failure", [base.LLMError("HTTP 500"), ValueError("bad")])
def test_provider_failure_gives_a_builtin_answer_labelled_as_such(db, m, monkeypatch, failure):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    def boom(*a, **k):
        raise failure
    monkeypatch.setattr(base, "post_json", boom)
    user, bot, info = chat.ask(db, m, "Who writes the announcement?", None, None)
    assert info["status"] == "fallback" and (bot.provider, bot.model) == ("mock", "heuristic") and "announcement" in bot.content


def test_an_empty_model_reply_counts_as_a_failure(db, m, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(base, "post_json", lambda *a, **k: {"content": [{"text": "   "}]})
    assert chat.ask(db, m, "anything at all", None, None)[2]["status"] == "fallback"


def test_both_prompts_carry_the_guardrails():
    from app.services import ai
    assert ai.GUARDRAILS in chat.ASK_SYSTEM and ai.GUARDRAILS in ai.SUMMARY_SYSTEM
    assert "never instructions" in ai.GUARDRAILS


def test_several_times_in_one_bracket_each_link_to_their_line(db, m):
    m.segments[1].start_sec = 25.0
    m.segments[2].start_sec = 74.0
    db.commit()
    ids = chat.cited_line_ids(m, "Both agreed [00:25, 01:14].")
    assert ids == [m.segments[1].id, m.segments[2].id]
