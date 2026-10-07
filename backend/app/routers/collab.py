"""Things people add on top of a meeting: comments on lines, soundbites (clips) and bookmarks."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, get_meeting
from ..models import Bookmark, Comment, Meeting, Segment, Soundbite, User
from ..schemas import (
    BookmarkCreate, BookmarkOut, CommentCreate, CommentOut, SoundbiteCreate, SoundbiteOut, SoundbiteUpdate,
)

router = APIRouter(prefix="/api", tags=["comments, soundbites, bookmarks"])


def find(db: Session, model, item_id: int, what: str):
    item = db.get(model, item_id)
    if not item:
        raise HTTPException(404, f"{what} not found")
    return item


def delete(db: Session, item) -> Response:
    db.delete(item)
    db.commit()
    return Response(status_code=204)


# ---- comments -------------------------------------------------------------------

def comment_out(c: Comment) -> CommentOut:
    return CommentOut(id=c.id, segment_id=c.segment_id, start_sec=c.segment.start_sec, quote=c.segment.text,
                      author=c.user.name, body=c.body, created_at=c.created_at)


@router.get("/meetings/{meeting_id}/comments", response_model=list[CommentOut])
def list_comments(meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    """Oldest line first, then oldest comment first, so threads read top to bottom."""
    rows = sorted(meeting.comments, key=lambda c: (c.segment.start_sec, c.id))
    return [comment_out(c) for c in rows]


@router.post("/meetings/{meeting_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(body: CommentCreate, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    segment = db.get(Segment, body.segment_id)
    if not segment or segment.meeting_id != meeting.id:
        raise HTTPException(400, "That line is not part of this meeting")
    comment = Comment(meeting_id=meeting.id, segment_id=segment.id, user_id=user.id, body=body.body)
    db.add(comment)
    db.commit()
    return comment_out(comment)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, db: Session = Depends(get_db)):
    return delete(db, find(db, Comment, comment_id, "Comment"))


# ---- soundbites -------------------------------------------------------------------

def excerpt(meeting: Meeting, start: float, end: float, limit: int = 240) -> str:
    text = " ".join(s.text for s in meeting.segments if s.end_sec > start and s.start_sec < end)
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def soundbite_out(meeting: Meeting, s: Soundbite) -> SoundbiteOut:
    return SoundbiteOut(id=s.id, start_sec=s.start_sec, end_sec=s.end_sec, title=s.title,
                        excerpt=excerpt(meeting, s.start_sec, s.end_sec), created_at=s.created_at)


@router.get("/meetings/{meeting_id}/soundbites", response_model=list[SoundbiteOut])
def list_soundbites(meeting: Meeting = Depends(get_meeting)):
    return [soundbite_out(meeting, s) for s in meeting.soundbites]


@router.post("/meetings/{meeting_id}/soundbites", response_model=SoundbiteOut, status_code=201)
def add_soundbite(body: SoundbiteCreate, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    if body.end_sec <= body.start_sec:
        raise HTTPException(422, "A soundbite must end after it starts")
    if body.end_sec > meeting.duration_sec + 1:
        raise HTTPException(422, "A soundbite cannot run past the end of the meeting")
    soundbite = Soundbite(meeting_id=meeting.id, **body.model_dump())
    db.add(soundbite)
    db.commit()
    return soundbite_out(meeting, soundbite)


@router.patch("/soundbites/{soundbite_id}", response_model=SoundbiteOut)
def rename_soundbite(soundbite_id: int, body: SoundbiteUpdate, db: Session = Depends(get_db)):
    soundbite = find(db, Soundbite, soundbite_id, "Soundbite")
    soundbite.title = body.title
    db.commit()
    return soundbite_out(db.get(Meeting, soundbite.meeting_id), soundbite)


@router.delete("/soundbites/{soundbite_id}", status_code=204)
def delete_soundbite(soundbite_id: int, db: Session = Depends(get_db)):
    return delete(db, find(db, Soundbite, soundbite_id, "Soundbite"))


# ---- bookmarks ----------------------------------------------------------------------

@router.get("/meetings/{meeting_id}/bookmarks", response_model=list[BookmarkOut])
def list_bookmarks(meeting: Meeting = Depends(get_meeting)):
    return meeting.bookmarks


@router.post("/meetings/{meeting_id}/bookmarks", response_model=BookmarkOut, status_code=201)
def add_bookmark(body: BookmarkCreate, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    if body.time_sec > meeting.duration_sec + 1:
        raise HTTPException(422, "That moment is past the end of the meeting")
    bookmark = Bookmark(meeting_id=meeting.id, **body.model_dump())
    db.add(bookmark)
    db.commit()
    return bookmark


@router.delete("/bookmarks/{bookmark_id}", status_code=204)
def delete_bookmark(bookmark_id: int, db: Session = Depends(get_db)):
    return delete(db, find(db, Bookmark, bookmark_id, "Bookmark"))
