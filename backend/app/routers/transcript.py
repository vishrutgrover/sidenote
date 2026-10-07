from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_meeting
from ..models import Comment, Meeting, Segment
from ..schemas import SegmentOut, SegmentUpdate
from ..services.search import segment_hits

router = APIRouter(prefix="/api", tags=["transcript"])


@router.get("/meetings/{meeting_id}/transcript", response_model=list[SegmentOut])
def read_transcript(q: str = "", meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    """All lines in time order. With ?q=, matching lines are flagged so the page can highlight and count them."""
    matched = {s.id for s in segment_hits(db, q, meeting.id)} if q else set()
    counts = dict(db.execute(select(Comment.segment_id, func.count()).where(Comment.meeting_id == meeting.id).group_by(Comment.segment_id)).all())
    return [SegmentOut.from_segment(s, s.id in matched, counts.get(s.id, 0)) for s in meeting.segments]


@router.patch("/segments/{segment_id}", response_model=SegmentOut)
def edit_segment(segment_id: int, body: SegmentUpdate, db: Session = Depends(get_db)):
    segment = db.get(Segment, segment_id)
    if not segment:
        raise HTTPException(404, "Line not found")
    segment.text = body.text
    db.commit()
    return SegmentOut.from_segment(segment)
