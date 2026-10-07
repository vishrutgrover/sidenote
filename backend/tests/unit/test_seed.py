import json

from sqlalchemy import func, select

from app.models import ActionItem, Meeting, Segment, Summary, Topic
from app.seed import guess_sentiment, seed


def test_seed_fills_every_part_of_each_meeting(db):
    seed(db)
    meetings = db.scalars(select(Meeting)).all()
    assert len(meetings) >= 6
    for m in meetings:
        assert m.duration_sec > 0
        assert len(m.segments) >= 8
        assert m.sections and m.action_items and m.topics
        assert json.loads(m.summary.keywords)
        assert sum(1 for p in m.participants if p.is_host) == 1


def test_seed_runs_only_once(db):
    seed(db)
    first = db.scalar(select(func.count(Segment.id)))
    seed(db)
    assert db.scalar(select(func.count(Segment.id))) == first


def test_segments_are_in_order_and_never_overlap(db):
    seed(db)
    for m in db.scalars(select(Meeting)).all():
        for a, b in zip(m.segments, m.segments[1:]):
            assert a.start_sec < a.end_sec <= b.start_sec


def test_bullets_point_at_real_moments(db):
    seed(db)
    for m in db.scalars(select(Meeting)).all():
        starts = {s.start_sec for s in m.segments}
        for section in m.sections:
            assert all(b.timestamp_sec in starts for b in section.bullets)
        assert all(a.timestamp_sec in starts for a in m.action_items)


def test_people_and_topics_are_shared_across_meetings(db):
    seed(db)
    # the same person (and tag) is reused, not copied per meeting
    from app.models import Person
    names = db.scalars(select(Person.name)).all()
    assert len(names) == len(set(names))
    assert db.scalar(select(func.count(Topic.id))) == len({t.name for m in db.scalars(select(Meeting)) for t in m.topics})


def test_sentiment_guess():
    assert guess_sentiment("That is a great result") == "positive"
    assert guess_sentiment("I'm stuck on this bug") == "negative"
    assert guess_sentiment("We meet on Tuesday") == "neutral"
    assert guess_sentiment("Great, but I'm stuck") == "negative"  # negative wins when mixed
