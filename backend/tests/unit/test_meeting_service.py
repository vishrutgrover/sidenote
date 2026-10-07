from sqlalchemy import func, select

from app.models import Person, Segment, User
from app.services.meetings import create_from_lines
from app.services.parser import parse


def make_user(db):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    return user


def test_first_speaker_is_host_and_duration_covers_last_line(db):
    lines = parse("[00:00:00] Ana: Hello\n[00:00:20] Ben: Hi there")
    meeting = create_from_lines(db, make_user(db), "Sync", lines, "paste")
    hosts = [p.person.name for p in meeting.participants if p.is_host]
    assert hosts == ["Ana"]
    assert meeting.duration_sec >= lines[-1].end
    assert len(meeting.segments) == 2


def test_same_speaker_name_reuses_the_person_across_meetings(db):
    user = make_user(db)
    create_from_lines(db, user, "One", parse("Ana: first"), "paste")
    create_from_lines(db, user, "Two", parse("Ana: second"), "paste")
    assert db.scalar(select(func.count(Person.id))) == 1


def test_each_speaker_gets_one_seat_and_a_colour(db):
    meeting = create_from_lines(db, make_user(db), "Sync", parse("Ana: a\nBen: b\nAna: c"), "paste")
    assert len(meeting.participants) == 2
    assert len({p.color for p in meeting.participants}) == 2
    assert db.scalar(select(func.count(Segment.id))) == 3
