from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, get_meeting
from ..models import ActionItem, Meeting, MeetingParticipant, User
from ..schemas import ActionItemCreate, ActionItemOut, ActionItemUpdate

router = APIRouter(prefix="/api", tags=["action items"])


def check_assignee(db: Session, meeting_id: int, seat_id: int | None):
    if seat_id is None:
        return
    seat = db.get(MeetingParticipant, seat_id)
    if not seat or seat.meeting_id != meeting_id:
        raise HTTPException(400, "Assignee must be a participant of this meeting")


def get_item(item_id: int, db: Session = Depends(get_db)) -> ActionItem:
    item = db.get(ActionItem, item_id)
    if not item:
        raise HTTPException(404, "Action item not found")
    return item


@router.get("/action-items", response_model=list[ActionItemOut])
def list_all(mine: bool = False, done: bool | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Every task across meetings, open ones first. mine=true keeps tasks assigned to the logged-in person."""
    stmt = select(ActionItem).join(Meeting)
    if mine:
        stmt = stmt.join(MeetingParticipant, ActionItem.assignee_id == MeetingParticipant.id).where(
            MeetingParticipant.person_id == user.person_id)
    if done is not None:
        stmt = stmt.where(ActionItem.is_done == done)
    stmt = stmt.order_by(ActionItem.is_done, Meeting.started_at.desc(), ActionItem.timestamp_sec)
    return [ActionItemOut.from_item(a) for a in db.scalars(stmt)]


@router.get("/meetings/{meeting_id}/action-items", response_model=list[ActionItemOut])
def list_for_meeting(meeting: Meeting = Depends(get_meeting)):
    return [ActionItemOut.from_item(a) for a in meeting.action_items]


@router.post("/meetings/{meeting_id}/action-items", response_model=ActionItemOut, status_code=201)
def create_item(body: ActionItemCreate, meeting: Meeting = Depends(get_meeting), db: Session = Depends(get_db)):
    check_assignee(db, meeting.id, body.assignee_id)
    item = ActionItem(meeting_id=meeting.id, **body.model_dump())
    db.add(item)
    db.commit()
    return ActionItemOut.from_item(item)


@router.patch("/action-items/{item_id}", response_model=ActionItemOut)
def update_item(body: ActionItemUpdate, item: ActionItem = Depends(get_item), db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    if changes.get("text") is None:
        changes.pop("text", None)  # text and is_done can't be cleared, only changed
    if changes.get("is_done") is None:
        changes.pop("is_done", None)
    check_assignee(db, item.meeting_id, changes.get("assignee_id"))
    for field, value in changes.items():
        setattr(item, field, value)
    db.commit()
    return ActionItemOut.from_item(item)


@router.delete("/action-items/{item_id}", status_code=204)
def delete_item(item: ActionItem = Depends(get_item), db: Session = Depends(get_db)):
    db.delete(item)
    db.commit()
    return Response(status_code=204)
