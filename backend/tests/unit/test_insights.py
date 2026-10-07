from app.models import Segment, User
from app.services.insights import compute
from app.services.meetings import create_from_lines
from app.services.parser import Line


def build(db, rows):
    """rows: (speaker, start, end, text)"""
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    return create_from_lines(db, user, "T", [Line(*r) for r in rows], "paste")


def test_talk_share_and_words_per_minute(db):
    m = build(db, [("Ana", 0, 30, " ".join(["word"] * 60)), ("Ben", 30, 40, " ".join(["word"] * 10))])
    ana, ben = compute(m)["speakers"]
    assert (ana["name"], ana["share_pct"], ana["wpm"]) == ("Ana", 75, 120)  # 60 words in 30s
    assert (ben["name"], ben["share_pct"], ben["wpm"]) == ("Ben", 25, 60)


def test_sentiment_counts_and_percentages(db):
    m = build(db, [("A", 0, 1, "That is great"), ("A", 1, 2, "We are stuck"), ("A", 2, 3, "Plain"), ("A", 3, 4, "Plain too")])
    s = compute(m)["sentiments"]
    assert s["positive"] == {"count": 1, "pct": 25} and s["negative"]["count"] == 1 and s["neutral"]["pct"] == 50


def test_filters_pick_out_questions_numbers_and_dates(db):
    m = build(db, [
        ("A", 0, 1, "Can we ship?"),
        ("A", 1, 2, "Revenue grew 40 percent"),
        ("A", 2, 3, "Let's meet on Friday"),
        ("A", 3, 4, "Nothing special here"),
        ("A", 4, 5, "Call at 10:30"),
    ])
    f = compute(m)["filters"]
    text = {s.id: s.text for s in m.segments}
    assert [text[i] for i in f["questions"]] == ["Can we ship?"]
    assert [text[i] for i in f["metrics"]] == ["Revenue grew 40 percent", "Call at 10:30"]
    assert [text[i] for i in f["dates_times"]] == ["Let's meet on Friday", "Call at 10:30"]
    assert f["tasks"] == []


def test_words_that_only_contain_a_day_name_do_not_count_as_dates(db):
    m = build(db, [("A", 0, 1, "Sundial and mayor and marching band")])
    assert compute(m)["filters"]["dates_times"] == []


def test_empty_meeting_does_not_divide_by_zero(db):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    from app.models import Meeting
    m = Meeting(title="Empty", created_by=user.id)
    db.add(m)
    db.commit()
    r = compute(m)
    assert r["speakers"] == [] and r["sentiments"]["neutral"] == {"count": 0, "pct": 0}


def test_line_with_removed_speaker_is_reported_as_unknown(db):
    m = build(db, [("Ana", 0, 10, "hello there"), ("Ben", 10, 20, "hi")])
    db.delete(m.participants[1])
    db.commit()
    db.refresh(m)
    assert "Unknown" in [s["name"] for s in compute(m)["speakers"]]
    assert isinstance(m.segments[0], Segment)
