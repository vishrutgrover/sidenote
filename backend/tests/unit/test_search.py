import pytest
from sqlalchemy import select, text

from app.models import Meeting, Segment, User
from app.services.search import fts_query, segment_hits


def add_line(db, meeting, line):
    seg = Segment(meeting_id=meeting.id, start_sec=0, end_sec=1, text=line)
    db.add(seg)
    db.commit()
    return seg


@pytest.fixture
def meeting(db):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    m = Meeting(title="Sync", created_by=user.id)
    db.add(m)
    db.commit()
    return m


def found(db, q):
    return [s.text for s in segment_hits(db, q)]


# ---- query sanitiser ------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("quick overview", '"quick" "overview"*'),
    ("ship", '"ship"*'),
    ('say "hello"', '"say" "hello"*'),
    ("a-b AND c", '"a" "b" "AND" "c"*'),
    ("café ☕ naïve", '"café" "naïve"*'),
])
def test_fts_query_quotes_every_word(raw, expected):
    assert fts_query(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "***", '"', "()-:^", "☕"])
def test_fts_query_returns_none_when_nothing_is_searchable(raw):
    assert fts_query(raw) is None


# ---- index stays in sync with the table -----------------------------------

def test_new_lines_are_searchable(db, meeting):
    add_line(db, meeting, "We should ship on Friday")
    assert found(db, "friday") == ["We should ship on Friday"]


def test_prefix_and_stemming(db, meeting):
    add_line(db, meeting, "We are launching the rollout")
    assert found(db, "launch")       # stemmed: launching -> launch
    assert found(db, "roll")         # prefix of the last word
    assert not found(db, "rollo x")  # words are ANDed


def test_editing_a_line_replaces_its_index_entry(db, meeting):
    seg = add_line(db, meeting, "The budget is tight")
    seg.text = "The roadmap is clear"
    db.commit()
    assert found(db, "budget") == []
    assert found(db, "roadmap") == ["The roadmap is clear"]


def test_deleting_a_line_removes_it_from_the_index(db, meeting):
    seg = add_line(db, meeting, "Remove me please")
    db.delete(seg)
    db.commit()
    assert found(db, "remove") == []


def test_deleting_the_meeting_in_sql_still_cleans_the_index(db, meeting):
    add_line(db, meeting, "Cascade deleted line")
    db.execute(text("DELETE FROM meetings WHERE id = :i"), {"i": meeting.id})  # database cascade, no ORM involved
    db.commit()
    assert found(db, "cascade") == []
    assert db.scalar(select(Segment.id)) is None


def test_search_can_be_limited_to_one_meeting(db, meeting):
    other = Meeting(title="Other", created_by=meeting.created_by)
    db.add(other)
    db.commit()
    add_line(db, meeting, "shared word here")
    add_line(db, other, "shared word there")
    assert len(segment_hits(db, "shared")) == 2
    assert [s.text for s in segment_hits(db, "shared", meeting.id)] == ["shared word here"]


@pytest.mark.parametrize("q", ['"', "*", "AND", "OR NOT", "(", "NEAR(a b", "col:val", "a'; DROP TABLE segments;--", "^x", "-"])
def test_odd_input_never_raises(db, meeting, q):
    add_line(db, meeting, "plain text")
    segment_hits(db, q)  # must not raise an FTS5 syntax error


def test_a_reused_row_id_does_not_inherit_the_deleted_lines_words(db, meeting):
    old = add_line(db, meeting, "Giraffe sighting reported")
    old_id = old.id
    db.delete(old)
    db.commit()
    new = add_line(db, meeting, "Budget review tomorrow")
    assert new.id == old_id  # SQLite hands the freed id to the next insert
    assert found(db, "giraffe") == []
    assert found(db, "budget") == ["Budget review tomorrow"]
