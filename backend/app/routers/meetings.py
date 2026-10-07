from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, get_meeting
from ..models import Meeting, MeetingParticipant, Topic, User
from ..schemas import MeetingFilters, MeetingOut, MeetingUpdate, ParticipantOut
from ..services import ai, parser
from ..services.meetings import add_participant, create_from_lines
from ..services.llm import registry
from ..services.search import title_or_person_clause

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

MAX_UPLOAD_BYTES = 2_000_000


def meeting_out(m: Meeting) -> MeetingOut:
    return MeetingOut(
        id=m.id, title=m.title, started_at=m.started_at, duration_sec=m.duration_sec, status=m.status,
        source=m.source, media_url=m.media_url, overview=m.summary.overview if m.summary else "",
        participants=[ParticipantOut.from_seat(p) for p in m.participants],
        topics=[t.name for t in m.topics],
    )


@router.get("", response_model=list[MeetingOut])
def list_meetings(f: Annotated[MeetingFilters, Query()], db: Session = Depends(get_db)):
    stmt = select(Meeting)
    if f.q:
        stmt = stmt.where(title_or_person_clause(f.q))
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
    provider: str = Form(""),
    model: str = Form(""),
    background: BackgroundTasks = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Create a meeting from pasted text or an uploaded .txt/.vtt/.json file.
    It comes back as 'processing'; the notes are written in the background and the status becomes 'ready'."""
    try:
        registry.resolve(provider or None, model or None)  # fail now, not after the upload
    except registry.ProviderUnavailable as e:
        raise HTTPException(400, str(e)) from None
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
    meeting = create_from_lines(db, user, title[:200], lines, source="upload" if file else "paste", status="processing")
    background.add_task(ai.process_meeting, meeting.id, provider or None, model or None)
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
