from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

def to_utc_naive(d: datetime) -> datetime:
    """The database keeps naive UTC, so convert any timezone-aware input to that."""
    return d.astimezone(timezone.utc).replace(tzinfo=None) if d.tzinfo else d


UtcTime = Annotated[datetime, AfterValidator(to_utc_naive)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ParticipantOut(BaseModel):
    id: int  # the seat in this meeting
    person_id: int
    name: str
    email: str | None
    color: str
    is_host: bool

    @classmethod
    def from_seat(cls, seat):
        return cls(id=seat.id, person_id=seat.person_id, name=seat.person.name, email=seat.person.email,
                   color=seat.color, is_host=seat.is_host)


class MeetingOut(BaseModel):
    id: int
    title: str
    started_at: datetime
    duration_sec: int
    status: str
    source: str
    media_url: str | None
    overview: str
    participants: list[ParticipantOut]
    topics: list[str]


class MeetingUpdate(BaseModel):
    title: Title | None = None
    participants: list[Title] | None = Field(None, description="Full list of names. Missing ones are removed, new ones added.")


class MeetingFilters(BaseModel):
    q: str | None = None
    participant: list[int] = []
    topic: list[str] = []
    after: UtcTime | None = Field(None, description="Started at or after this moment")
    before: UtcTime | None = Field(None, description="Started before this moment")
    min_minutes: int | None = None
    max_minutes: int | None = None
    sort: str = Field("recent", pattern="^(recent|oldest)$")


class SegmentOut(BaseModel):
    id: int
    start_sec: float
    end_sec: float
    text: str
    sentiment: str
    speaker: ParticipantOut | None
    match: bool = False  # true when it matches the ?q= search

    @classmethod
    def from_segment(cls, seg, match: bool = False):
        return cls(id=seg.id, start_sec=seg.start_sec, end_sec=seg.end_sec, text=seg.text, sentiment=seg.sentiment,
                   speaker=ParticipantOut.from_seat(seg.speaker) if seg.speaker else None, match=match)


class SegmentUpdate(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class SearchResult(BaseModel):
    meeting: MeetingOut
    title_match: bool
    hit_count: int
    hits: list[SegmentOut]  # first few matching lines


class BulletOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # lets the ORM row be passed in directly

    id: int
    text: str
    timestamp_sec: float | None


class SectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    bullets: list[BulletOut]


class SummaryOut(BaseModel):
    overview: str
    keywords: list[str]
    sections: list[SectionOut]


class SummaryUpdate(BaseModel):
    overview: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]


class BulletUpdate(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


ActionText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class ActionItemOut(BaseModel):
    id: int
    meeting_id: int
    meeting_title: str
    text: str
    assignee: ParticipantOut | None
    timestamp_sec: float | None
    due_date: datetime | None
    is_done: bool

    @classmethod
    def from_item(cls, a):
        return cls(id=a.id, meeting_id=a.meeting_id, meeting_title=a.meeting.title, text=a.text,
                   assignee=ParticipantOut.from_seat(a.assignee) if a.assignee else None,
                   timestamp_sec=a.timestamp_sec, due_date=a.due_date, is_done=a.is_done)


class ActionItemCreate(BaseModel):
    text: ActionText
    assignee_id: int | None = None  # a seat id from the meeting's participants
    timestamp_sec: float | None = Field(None, ge=0)
    due_date: UtcTime | None = None


class ActionItemUpdate(BaseModel):
    """Only the fields sent are changed, so null really means 'clear it'."""
    text: ActionText | None = None
    assignee_id: int | None = None
    timestamp_sec: float | None = Field(None, ge=0)
    due_date: UtcTime | None = None
    is_done: bool | None = None


class TopicOut(BaseModel):
    name: str
    meeting_count: int
