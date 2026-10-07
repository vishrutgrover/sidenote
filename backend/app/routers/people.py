from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import ActionItem, Meeting, MeetingParticipant, Person, Segment, User
from ..schemas import ActionItemOut, PersonDetail, PersonMeeting, PersonOut

router = APIRouter(prefix="/api/people", tags=["people"])


def meeting_counts(db: Session) -> dict[int, int]:
    rows = db.execute(select(MeetingParticipant.person_id, func.count()).group_by(MeetingParticipant.person_id))
    return dict(rows.all())


@router.get("", response_model=list[PersonOut])
def list_people(q: str = "", db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Everyone who has been in a meeting, busiest first. q matches name or email."""
    stmt = select(Person)
    if q:
        stmt = stmt.where(Person.name.icontains(q, autoescape=True) | Person.email.icontains(q, autoescape=True))
    counts = meeting_counts(db)
    people = [PersonOut(id=p.id, name=p.name, email=p.email, meeting_count=counts.get(p.id, 0), is_me=p.id == user.person_id)
              for p in db.scalars(stmt)]
    return sorted(people, key=lambda p: (-p.meeting_count, p.name))


@router.get("/{person_id}", response_model=PersonDetail)
def read_person(person_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found")

    mine = Segment.speaker_id.in_(select(MeetingParticipant.id).where(MeetingParticipant.person_id == person_id))
    seconds = Segment.end_sec - Segment.start_sec
    talk = dict(db.execute(select(Segment.meeting_id, func.sum(seconds)).where(mine).group_by(Segment.meeting_id)).all())
    everyone = dict(db.execute(select(Segment.meeting_id, func.sum(seconds)).group_by(Segment.meeting_id)).all())
    words = sum(len(t.split()) for t in db.scalars(select(Segment.text).where(mine)))
    total = sum(talk.values())

    meetings = db.scalars(select(Meeting).join(MeetingParticipant).where(MeetingParticipant.person_id == person_id)
                          .order_by(Meeting.started_at.desc())).all()
    tasks = db.scalars(
        select(ActionItem).join(MeetingParticipant, ActionItem.assignee_id == MeetingParticipant.id).join(Meeting, ActionItem.meeting_id == Meeting.id)
        .where(MeetingParticipant.person_id == person_id, ActionItem.is_done.is_(False))
        .order_by(Meeting.started_at.desc(), ActionItem.timestamp_sec))
    return PersonDetail(
        id=person.id, name=person.name, email=person.email, meeting_count=len(meetings), is_me=person.id == user.person_id,
        total_talk_sec=round(total, 1), wpm=round(words / (total / 60)) if total else 0,
        meetings=[PersonMeeting(id=m.id, title=m.title, started_at=m.started_at, talk_sec=round(talk.get(m.id, 0), 1),
                                share_pct=round(100 * talk.get(m.id, 0) / everyone[m.id]) if everyone.get(m.id) else 0)
                  for m in meetings],
        open_tasks=[ActionItemOut.from_item(a) for a in tasks],
    )
