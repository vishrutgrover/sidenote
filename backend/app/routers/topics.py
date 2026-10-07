from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_meeting
from ..models import Meeting, Topic, meeting_topics
from ..schemas import TopicOut
from ..services.meetings import get_or_create_topic

router = APIRouter(prefix="/api", tags=["topics"])

TopicName = Annotated[str, Path(min_length=1, max_length=50)]


def clean(name: str) -> str:
    return " ".join(name.lower().split())


@router.get("/topics", response_model=list[TopicOut])
def list_topics(db: Session = Depends(get_db)):
    """Every tag in use with how many meetings carry it, most used first."""
    count = func.count(meeting_topics.c.meeting_id)
    rows = db.execute(select(Topic.name, count).join(meeting_topics).group_by(Topic.id).order_by(count.desc(), Topic.name))
    return [TopicOut(name=n, meeting_count=c) for n, c in rows]


@router.put("/meetings/{meeting_id}/topics/{name}", response_model=list[str])
def add_topic(name: TopicName, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    """Tag a meeting. Doing it twice is fine."""
    name = clean(name)
    if not name:
        raise HTTPException(400, "Topic name is empty")
    topic = get_or_create_topic(db, name)
    if topic not in meeting.topics:
        meeting.topics.append(topic)
    db.commit()
    return [t.name for t in meeting.topics]


@router.delete("/meetings/{meeting_id}/topics/{name}", status_code=204)
def remove_topic(name: TopicName, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    meeting.topics = [t for t in meeting.topics if t.name != clean(name)]
    db.commit()
    return Response(status_code=204)
