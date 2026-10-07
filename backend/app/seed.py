import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    ActionItem, Meeting, MeetingParticipant, NoteBullet, NoteSection, Person, Segment, Summary, Topic, User,
)
from .seed_data import MEETINGS

DEFAULT_USER = {"name": "Vishrut Grover", "email": "vishrut@example.com"}
COLORS = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E", "#E84393"]
WORDS_PER_SEC = 2.8
PAUSE_SEC = 1.5

POSITIVE = ("great", "love", "good", "nice", "perfect", "happy", "like that")
NEGATIVE = ("problem", "stuck", "worried", "risk", "slow", "bug", "blocker", "messy", "hurts")


def guess_sentiment(text: str) -> str:
    low = text.lower()
    if any(w in low for w in NEGATIVE):
        return "negative"
    if any(w in low for w in POSITIVE):
        return "positive"
    return "neutral"


def get_or_create_person(db: Session, name: str) -> Person:
    person = db.scalar(select(Person).where(Person.name == name))
    if not person:
        email = name.lower().replace(" ", ".") + "@example.com"
        person = Person(name=name, email=email)
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


def seed(db: Session) -> None:
    """Fill an empty database with sample meetings. Does nothing if data exists."""
    if db.scalar(select(User.id).limit(1)):
        return

    user = User(**DEFAULT_USER)
    db.add(user)
    db.flush()

    for data in MEETINGS:
        meeting = Meeting(
            title=data["title"],
            started_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=data["days_ago"], minutes=5),
            source="seed",
            created_by=user.id,
        )
        db.add(meeting)
        db.flush()

        seats = []
        for i, name in enumerate(data["people"]):
            seat = MeetingParticipant(
                meeting_id=meeting.id, person_id=get_or_create_person(db, name).id,
                color=COLORS[i % len(COLORS)], is_host=(i == 0),
            )
            db.add(seat)
            seats.append(seat)
        db.flush()

        # lay the lines out one after another, so each has a believable start and end
        starts, t = [], 0.0
        for speaker, text in data["lines"]:
            end = t + len(text.split()) / WORDS_PER_SEC
            db.add(Segment(
                meeting_id=meeting.id, speaker_id=seats[speaker].id,
                start_sec=round(t, 1), end_sec=round(end, 1), text=text, sentiment=guess_sentiment(text),
            ))
            starts.append(round(t, 1))
            t = end + PAUSE_SEC
        meeting.duration_sec = int(t)

        db.add(Summary(meeting_id=meeting.id, overview=data["overview"], keywords=json.dumps(data["keywords"])))

        for pos, (title, bullets) in enumerate(data["sections"]):
            section = NoteSection(meeting_id=meeting.id, title=title, position=pos)
            section.bullets = [
                NoteBullet(text=text, timestamp_sec=starts[line], position=i) for i, (text, line) in enumerate(bullets)
            ]
            db.add(section)

        for assignee, text, line, done in data["actions"]:
            db.add(ActionItem(
                meeting_id=meeting.id, assignee_id=seats[assignee].id, text=text,
                timestamp_sec=starts[line], is_done=done,
            ))

        meeting.topics = [get_or_create_topic(db, tag) for tag in data["tags"]]

    db.commit()
