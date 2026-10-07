from app.models import User
from app.routers.collab import excerpt
from app.services.meetings import create_from_lines
from app.services.parser import parse


def meeting(db):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    text = "[00:00:00] A: first line\n[00:00:10] B: second line\n[00:00:20] A: third line"
    return create_from_lines(db, user, "T", parse(text), "paste")


def test_excerpt_includes_every_line_that_overlaps_the_range(db):
    m = meeting(db)
    assert excerpt(m, 0.5, 21) == "first line second line third line"  # first line runs 0 to 1s, so it overlaps
    assert excerpt(m, 10, 20) == "second line"
    assert excerpt(m, 100, 200) == ""


def test_long_excerpts_are_cut_with_an_ellipsis(db):
    m = meeting(db)
    assert excerpt(m, 0, 30, limit=15) == "first line sec…"
