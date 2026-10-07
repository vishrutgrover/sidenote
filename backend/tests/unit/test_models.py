from sqlalchemy import select

from app.models import (
    ActionItem, Meeting, MeetingParticipant, NoteBullet, NoteSection, Person, Segment, User,
)


def make_meeting(db):
    user = User(name="Test User", email="t@example.com")
    person = Person(name="Ana", email="ana@example.com")
    db.add_all([user, person])
    db.flush()
    meeting = Meeting(title="Sync", created_by=user.id)
    db.add(meeting)
    db.flush()
    seat = MeetingParticipant(meeting_id=meeting.id, person_id=person.id, is_host=True)
    db.add(seat)
    db.flush()
    db.add(Segment(meeting_id=meeting.id, speaker_id=seat.id, start_sec=0, end_sec=3, text="Hello"))
    section = NoteSection(meeting_id=meeting.id, title="Intro", bullets=[NoteBullet(text="Said hello")])
    db.add(section)
    db.add(ActionItem(meeting_id=meeting.id, assignee_id=seat.id, text="Follow up"))
    db.commit()
    return meeting, person


def test_deleting_a_meeting_removes_everything_under_it(db):
    meeting, person = make_meeting(db)
    db.delete(meeting)
    db.commit()
    for model in (Segment, MeetingParticipant, NoteSection, NoteBullet, ActionItem):
        assert db.scalar(select(model.id)) is None, model.__name__
    assert db.get(Person, person.id) is not None  # people outlive meetings


def test_removing_a_participant_keeps_transcript_lines(db):
    meeting, _ = make_meeting(db)
    db.delete(meeting.participants[0])
    db.commit()
    segment = db.scalar(select(Segment))
    assert segment is not None and segment.speaker_id is None


def test_same_person_cannot_join_a_meeting_twice(db):
    import pytest
    from sqlalchemy.exc import IntegrityError

    meeting, person = make_meeting(db)
    db.add(MeetingParticipant(meeting_id=meeting.id, person_id=person.id))
    with pytest.raises(IntegrityError):
        db.commit()
