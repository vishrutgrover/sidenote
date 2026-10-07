from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Meeting, User


def current_user(db: Session = Depends(get_db)) -> User:
    """No real auth: everyone is the first user."""
    return db.scalar(select(User).limit(1))


def get_meeting(meeting_id: int, db: Session = Depends(get_db)) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    return meeting
