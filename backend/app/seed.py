import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ActionItem, Meeting, MeetingParticipant, NoteBullet, NoteSection, Segment, Summary, User
from .seed_data import MEETINGS
from .services.meetings import COLORS, get_or_create_person, get_or_create_topic
from .services.parser import PAUSE_SEC, WORDS_PER_SEC
from .services.sentiment import guess_sentiment

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"

DEFAULT_USER = "Vishrut Grover"


def layout(texts: list[str]) -> list[tuple[float, float]]:
    """Start and end second of each line, one after another with a short pause. The sample audio uses this too."""
    times, t = [], 0.0
    for text in texts:
        end = t + len(text.split()) / WORDS_PER_SEC
        times.append((round(t, 1), round(end, 1)))
        t = end + PAUSE_SEC
    return times


def slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def seed(db: Session) -> None:
    """Fill an empty database with sample meetings. Does nothing if data exists."""
    if db.scalar(select(User.id).limit(1)):
        return

    me = get_or_create_person(db, DEFAULT_USER)
    user = User(name=me.name, email=me.email, person_id=me.id)
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
        times = layout([text for _, text in data["lines"]])
        for (speaker, text), (start, end) in zip(data["lines"], times):
            db.add(Segment(
                meeting_id=meeting.id, speaker_id=seats[speaker].id,
                start_sec=start, end_sec=end, text=text, sentiment=guess_sentiment(text),
            ))
        starts = [start for start, _ in times]
        meeting.duration_sec = int(times[-1][1] + PAUSE_SEC)
        if (MEDIA_DIR / f"{slug(data['title'])}.mp3").exists():  # sample audio is optional
            meeting.media_url = f"/media/{slug(data['title'])}.mp3"

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
