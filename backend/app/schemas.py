from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, StringConstraints

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
