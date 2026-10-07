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
    comment_count: int = 0

    @classmethod
    def from_segment(cls, seg, match: bool = False, comment_count: int = 0):
        return cls(id=seg.id, start_sec=seg.start_sec, end_sec=seg.end_sec, text=seg.text, sentiment=seg.sentiment,
                   speaker=ParticipantOut.from_seat(seg.speaker) if seg.speaker else None, match=match,
                   comment_count=comment_count)


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


class AiChoice(BaseModel):
    provider: str | None = None
    model: str | None = None


class AiInfo(BaseModel):
    provider: str
    model: str
    status: str  # ok | fallback (the chosen provider failed, the built-in logic answered)
    error: str | None


class RegenerateOut(SummaryOut):
    ai: AiInfo


class LlmProviderOut(BaseModel):
    name: str
    label: str
    models: list[str]


class LlmModelsOut(BaseModel):
    default_provider: str
    default_model: str
    providers: list[LlmProviderOut]


class AiRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    meeting_id: int | None
    task: str
    provider: str
    model: str
    latency_ms: int
    status: str
    error: str | None
    created_at: datetime


class CommentCreate(BaseModel):
    segment_id: int
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class CommentOut(BaseModel):
    id: int
    segment_id: int
    start_sec: float  # where the commented line starts
    quote: str  # the commented line
    author: str
    body: str
    created_at: datetime


class SoundbiteCreate(BaseModel):
    start_sec: float = Field(ge=0)
    end_sec: float = Field(gt=0)
    title: Title


class SoundbiteUpdate(BaseModel):
    title: Title


class SoundbiteOut(BaseModel):
    id: int
    start_sec: float
    end_sec: float
    title: str
    excerpt: str  # what was said in that range
    created_at: datetime


class BookmarkCreate(BaseModel):
    time_sec: float = Field(ge=0)
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ""


class BookmarkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    time_sec: float
    note: str
    created_at: datetime


class AskIn(AiChoice):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class SourceOut(BaseModel):
    meeting_id: int
    meeting_title: str
    segment_id: int
    start_sec: float
    speaker: str


class ChatMessageOut(BaseModel):
    id: int
    meeting_id: int | None
    role: str
    content: str
    sources: list[SourceOut]
    provider: str | None
    model: str | None
    created_at: datetime


class AskOut(BaseModel):
    user: ChatMessageOut
    assistant: ChatMessageOut
    ai: AiInfo
