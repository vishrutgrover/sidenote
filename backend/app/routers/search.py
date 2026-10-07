from itertools import groupby
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Meeting
from ..schemas import SearchResult, SegmentOut
from ..services.search import segment_hits, title_or_person_clause
from .meetings import meeting_out

router = APIRouter(prefix="/api/search", tags=["search"])

HITS_PER_MEETING = 3


@router.get("", response_model=list[SearchResult])
def search(
    q: Annotated[str, Query(min_length=1, max_length=200)],
    title_only: bool = False,
    sort: Annotated[str, Query(pattern="^(recent|oldest)$")] = "recent",
    db: Session = Depends(get_db),
):
    """Across every meeting: title and participant matches, plus matching transcript lines grouped per meeting."""
    title_ids = set(db.scalars(select(Meeting.id).where(title_or_person_clause(q))))
    hits = {} if title_only else {mid: list(g) for mid, g in groupby(segment_hits(db, q), key=lambda s: s.meeting_id)}
    order = Meeting.started_at.desc() if sort == "recent" else Meeting.started_at.asc()
    meetings = db.scalars(select(Meeting).where(Meeting.id.in_(title_ids | hits.keys())).order_by(order))
    return [
        SearchResult(
            meeting=meeting_out(m), title_match=m.id in title_ids, hit_count=len(hits.get(m.id, [])),
            hits=[SegmentOut.from_segment(s, True) for s in hits.get(m.id, [])[:HITS_PER_MEETING]],
        )
        for m in meetings
    ]
