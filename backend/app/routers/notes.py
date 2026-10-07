import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_meeting
from ..models import Meeting, NoteBullet, Summary
from ..schemas import AiChoice, BulletOut, BulletUpdate, RegenerateOut, SummaryOut, SummaryUpdate
from ..services import ai, insights
from ..services.llm.registry import ProviderUnavailable

router = APIRouter(prefix="/api", tags=["notes"])


def summary_out(m: Meeting) -> SummaryOut:
    """A meeting without notes yet (still processing) returns empty notes, not an error."""
    return SummaryOut(
        overview=m.summary.overview if m.summary else "",
        keywords=json.loads(m.summary.keywords) if m.summary else [],
        sections=m.sections,
    )


@router.get("/meetings/{meeting_id}/summary", response_model=SummaryOut)
def read_summary(meeting: Meeting = Depends(get_meeting)):
    return summary_out(meeting)


@router.patch("/meetings/{meeting_id}/summary", response_model=SummaryOut)
def edit_summary(body: SummaryUpdate, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    if not meeting.summary:
        meeting.summary = Summary()
    meeting.summary.overview = body.overview
    db.commit()
    return summary_out(meeting)


@router.post("/meetings/{meeting_id}/summary/regenerate", response_model=RegenerateOut)
def regenerate_summary(body: AiChoice | None = None, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    """Rewrite summary and sections, add any new tasks. Pick a provider and model, or use the default."""
    body = body or AiChoice()
    try:
        info = ai.generate_notes(db, meeting, body.provider, body.model)
    except ProviderUnavailable as e:
        raise HTTPException(400, str(e)) from None
    return RegenerateOut(**summary_out(meeting).model_dump(), ai=info)


@router.patch("/note-bullets/{bullet_id}", response_model=BulletOut)
def edit_bullet(bullet_id: int, body: BulletUpdate, db: Session = Depends(get_db)):
    bullet = db.get(NoteBullet, bullet_id)
    if not bullet:
        raise HTTPException(404, "Note not found")
    bullet.text = body.text
    db.commit()
    return bullet


@router.get("/meetings/{meeting_id}/insights")
def read_insights(meeting: Meeting = Depends(get_meeting)):
    """Sentiment split, who talked how much, and which lines are questions, numbers or dates."""
    return insights.compute(meeting)
