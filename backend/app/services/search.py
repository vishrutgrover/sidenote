import re

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..models import Meeting, MeetingParticipant, Person, Segment
from .ai_mock import words


def fts_query(q: str) -> str | None:
    """Make user text safe for FTS5. Every word is quoted so operators like AND, NEAR, - and *
    are just words, and the last word matches as a prefix (search as you type).
    Returns None when there is nothing searchable."""
    words = re.findall(r"\w+", q)
    if not words:
        return None
    return " ".join(f'"{w}"' for w in words) + "*"


def segment_hits(db: Session, q: str, meeting_id: int | None = None) -> list[Segment]:
    """Transcript lines matching q, in meeting then time order."""
    match = fts_query(q)
    if not match:
        return []
    sql = "SELECT s.id FROM segments s JOIN segments_fts ON segments_fts.rowid = s.id WHERE segments_fts MATCH :q"
    params = {"q": match}
    if meeting_id is not None:
        sql += " AND s.meeting_id = :m"
        params["m"] = meeting_id
    ids = db.execute(text(sql), params).scalars().all()
    return list(db.scalars(select(Segment).where(Segment.id.in_(ids)).order_by(Segment.meeting_id, Segment.start_sec)))


def title_or_person_clause(q: str):
    """SQL condition: meeting title or any participant name contains q (wildcards in q are literal)."""
    by_person = select(MeetingParticipant.meeting_id).join(Person).where(Person.name.icontains(q, autoescape=True))
    return Meeting.title.icontains(q, autoescape=True) | Meeting.id.in_(by_person)


def top_segments(db: Session, question: str, meeting_id: int | None = None, limit: int = 8) -> list[Segment]:
    """The lines most relevant to a question, best match first by bm25 and returned in reading order.
    Any meaningful word may match (OR), unlike segment_hits where every word must."""
    terms = list(dict.fromkeys(words(question)))
    if not terms:
        return []
    sql = ("SELECT s.id FROM segments s JOIN segments_fts ON segments_fts.rowid = s.id "
           "WHERE segments_fts MATCH :q" + (" AND s.meeting_id = :m" if meeting_id is not None else "")
           + " ORDER BY bm25(segments_fts) LIMIT :n")
    params = {"q": " OR ".join(f'"{w}"*' for w in terms), "n": limit}
    if meeting_id is not None:
        params["m"] = meeting_id
    ids = db.execute(text(sql), params).scalars().all()
    return list(db.scalars(select(Segment).where(Segment.id.in_(ids)).order_by(Segment.meeting_id, Segment.start_sec)))
