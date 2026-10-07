"""Shared meeting helpers, used by both the seed script and the API."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Meeting, MeetingParticipant, Person, Segment, Topic, User
from .parser import Line
from .sentiment import guess_sentiment

COLORS = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393"]


def get_or_create_person(db: Session, name: str) -> Person:
    person = db.scalar(select(Person).where(Person.name == name))
    if not person:
        person = Person(name=name, email=name.lower().replace(" ", ".") + "@example.com")
        db.add(person)
        db.flush()
    return person


def get_or_create_topic(db: Session, name: str) -> Topic:
    topic = db.scalar(select(Topic).where(Topic.name == name))
    if not topic:
        topic = Topic(name=name)
        db.add(topic)
        db.flush()
    return topic


def add_participant(db: Session, meeting: Meeting, name: str, is_host: bool = False) -> MeetingParticipant:
    seat = MeetingParticipant(
        meeting_id=meeting.id, person_id=get_or_create_person(db, name).id,
        color=COLORS[len(meeting.participants) % len(COLORS)], is_host=is_host,
    )
    db.add(seat)
    db.flush()
    db.refresh(meeting, ["participants"])
    return seat


def create_from_lines(db: Session, user: User, title: str, lines: list[Line], source: str, status: str = "ready") -> Meeting:
    """New meeting from parsed transcript lines. The first speaker is the host."""
    meeting = Meeting(
        title=title, source=source, created_by=user.id, status=status,
        started_at=datetime.now(timezone.utc).replace(tzinfo=None),
        duration_sec=int(lines[-1].end) + 1,
    )
    db.add(meeting)
    db.flush()
    seats: dict[str, MeetingParticipant] = {}
    for line in lines:
        if line.speaker not in seats:
            seats[line.speaker] = add_participant(db, meeting, line.speaker, is_host=not seats)
        db.add(Segment(
            meeting_id=meeting.id, speaker_id=seats[line.speaker].id, start_sec=line.start,
            end_sec=line.end, text=line.text, sentiment=guess_sentiment(line.text),
        ))
    db.commit()
    return meeting
