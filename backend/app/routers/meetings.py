from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, get_meeting
from ..models import Meeting, MeetingParticipant, Person, Topic, User
from ..schemas import MeetingFilters, MeetingOut, MeetingUpdate, ParticipantOut
from ..services import parser
from ..services.meetings import add_participant, create_from_lines

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

MAX_UPLOAD_BYTES = 2_000_000


def meeting_out(m: Meeting) -> MeetingOut:
    return MeetingOut(
        id=m.id, title=m.title, started_at=m.started_at, duration_sec=m.duration_sec, status=m.status,
        source=m.source, media_url=m.media_url, overview=m.summary.overview if m.summary else "",
        participants=[
            ParticipantOut(id=p.id, person_id=p.person_id, name=p.person.name, email=p.person.email,
                           color=p.color, is_host=p.is_host)
            for p in m.participants
        ],
        topics=[t.name for t in m.topics],
    )


@router.get("", response_model=list[MeetingOut])
def list_meetings(f: Annotated[MeetingFilters, Query()], db: Session = Depends(get_db)):
    stmt = select(Meeting)
    if f.q:
        by_person = select(MeetingParticipant.meeting_id).join(Person).where(Person.name.icontains(f.q, autoescape=True))
        stmt = stmt.where(Meeting.title.icontains(f.q, autoescape=True) | Meeting.id.in_(by_person))
    if f.participant:
        stmt = stmt.where(Meeting.id.in_(
            select(MeetingParticipant.meeting_id).where(MeetingParticipant.person_id.in_(f.participant))))
    if f.topic:
        stmt = stmt.where(Meeting.topics.any(Topic.name.in_(f.topic)))
    if f.after:
        stmt = stmt.where(Meeting.started_at >= f.after)
    if f.before:
        stmt = stmt.where(Meeting.started_at < f.before)
    if f.min_minutes is not None:
        stmt = stmt.where(Meeting.duration_sec >= f.min_minutes * 60)
    if f.max_minutes is not None:
        stmt = stmt.where(Meeting.duration_sec < f.max_minutes * 60)
    stmt = stmt.order_by(Meeting.started_at.desc() if f.sort == "recent" else Meeting.started_at.asc())
    return [meeting_out(m) for m in db.scalars(stmt)]


@router.post("", response_model=MeetingOut, status_code=201)
async def create_meeting(
    title: str = Form(""),
    transcript: str = Form(""),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Create a meeting from pasted text or an uploaded .txt/.vtt/.json file."""
    filename = ""
    if file:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "File is larger than 2 MB")
        try:
            transcript, filename = data.decode("utf-8"), file.filename or ""
        except UnicodeDecodeError:
            raise HTTPException(400, "File must be UTF-8 text") from None
    try:
        lines = parser.parse(transcript, filename)
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    title = title.strip() or filename.rsplit(".", 1)[0] or "Untitled meeting"
    meeting = create_from_lines(db, user, title[:200], lines, source="upload" if file else "paste")
    return meeting_out(meeting)


@router.get("/{meeting_id}", response_model=MeetingOut)
def read_meeting(meeting: Meeting = Depends(get_meeting)):
    return meeting_out(meeting)


@router.patch("/{meeting_id}", response_model=MeetingOut)
def update_meeting(body: MeetingUpdate, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    if body.title:
        meeting.title = body.title
    if body.participants is not None:
        wanted = set(body.participants)
        for seat in list(meeting.participants):
            if seat.person.name not in wanted:
                db.delete(seat)
        db.flush()
        db.refresh(meeting, ["participants"])
        have = {seat.person.name for seat in meeting.participants}
        for name in body.participants:
            if name not in have:
                add_participant(db, meeting, name)
                have.add(name)
    db.commit()
    return meeting_out(meeting)


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    db.delete(meeting)
    db.commit()
    return Response(status_code=204)
