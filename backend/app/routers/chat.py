import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_meeting
from ..models import ChatMessage, Meeting, Segment
from ..schemas import AskIn, AskOut, ChatMessageOut, SourceOut
from ..services import chat
from ..services.llm.registry import ProviderUnavailable

router = APIRouter(prefix="/api", tags=["ask sidenote"])


def message_out(db: Session, m: ChatMessage) -> ChatMessageOut:
    sources = []
    for seg in db.scalars(select(Segment).where(Segment.id.in_(json.loads(m.sources))).order_by(Segment.meeting_id, Segment.start_sec)):
        sources.append(SourceOut(meeting_id=seg.meeting_id, meeting_title=db.get(Meeting, seg.meeting_id).title,
                                 segment_id=seg.id, start_sec=seg.start_sec,
                                 speaker=seg.speaker.person.name if seg.speaker else "Unknown"))
    return ChatMessageOut(id=m.id, meeting_id=m.meeting_id, role=m.role, content=m.content, sources=sources,
                          provider=m.provider, model=m.model, created_at=m.created_at)


def answer(db: Session, meeting: Meeting | None, body: AskIn) -> AskOut:
    try:
        user, bot, info = chat.ask(db, meeting, body.question, body.provider, body.model)
    except ProviderUnavailable as e:
        raise HTTPException(400, str(e)) from None
    return AskOut(user=message_out(db, user), assistant=message_out(db, bot), ai=info)


def history(db: Session, meeting: Meeting | None) -> list[ChatMessageOut]:
    return [message_out(db, m) for m in chat.recent_messages(db, meeting, 100)]


def clear(db: Session, meeting: Meeting | None) -> Response:
    db.execute(delete(ChatMessage).where(chat.scope(meeting)))
    db.commit()
    return Response(status_code=204)


# one meeting
@router.post("/meetings/{meeting_id}/ask", response_model=AskOut)
def ask_meeting(body: AskIn, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    return answer(db, meeting, body)


@router.get("/meetings/{meeting_id}/chat", response_model=list[ChatMessageOut])
def meeting_chat(meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    return history(db, meeting)


@router.delete("/meetings/{meeting_id}/chat", status_code=204)
def clear_meeting_chat(meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    return clear(db, meeting)


# all meetings
@router.post("/ask", response_model=AskOut)
def ask_everything(body: AskIn, db: Session = Depends(get_db)):
    return answer(db, None, body)


@router.get("/chat", response_model=list[ChatMessageOut])
def global_chat(db: Session = Depends(get_db)):
    return history(db, None)


@router.delete("/chat", status_code=204)
def clear_global_chat(db: Session = Depends(get_db)):
    return clear(db, None)
