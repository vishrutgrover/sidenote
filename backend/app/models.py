from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return datetime.now(timezone.utc)


# ---- people -------------------------------------------------------------

class User(Base):
    """The one logged-in user (no real auth)."""
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    person_id: Mapped[int | None] = mapped_column(ForeignKey("people.id"))  # who "me" is in transcripts and tasks


class Person(Base):
    """Anyone who speaks in any meeting. One row per human, shared across meetings."""
    __tablename__ = "people"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200), unique=True)


# ---- meetings -----------------------------------------------------------

# meetings <-> topics is many-to-many, so it gets a plain join table
meeting_topics = Table(
    "meeting_topics", Base.metadata,
    Column("meeting_id", ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True),
    Column("topic_id", ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True),
)


class Topic(Base):
    __tablename__ = "topics"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)


class Meeting(Base):
    __tablename__ = "meetings"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)
    media_url: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(20), default="seed")  # seed | upload | paste
    status: Mapped[str] = mapped_column(String(20), default="ready")  # processing | ready | failed
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    participants = relationship("MeetingParticipant", cascade="all, delete-orphan", order_by="MeetingParticipant.id")
    segments = relationship("Segment", cascade="all, delete-orphan", order_by="Segment.start_sec")
    summary = relationship("Summary", cascade="all, delete-orphan", uselist=False)
    sections = relationship("NoteSection", cascade="all, delete-orphan", order_by="NoteSection.position")
    action_items = relationship("ActionItem", cascade="all, delete-orphan", order_by="ActionItem.timestamp_sec")
    topics = relationship("Topic", secondary=meeting_topics)
    comments = relationship("Comment", cascade="all, delete-orphan")
    soundbites = relationship("Soundbite", cascade="all, delete-orphan", order_by="Soundbite.start_sec")
    bookmarks = relationship("Bookmark", cascade="all, delete-orphan", order_by="Bookmark.time_sec")
    chat_messages = relationship("ChatMessage", cascade="all, delete-orphan", order_by="ChatMessage.id")


class MeetingParticipant(Base):
    """A person's seat in one meeting. Transcript lines and tasks point here."""
    __tablename__ = "meeting_participants"
    __table_args__ = (UniqueConstraint("meeting_id", "person_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("people.id"), index=True)
    color: Mapped[str] = mapped_column(String(9), default="#6C5CE7")
    is_host: Mapped[bool] = mapped_column(Boolean, default=False)

    person = relationship("Person")


# ---- transcript ---------------------------------------------------------

class Segment(Base):
    """One transcript line."""
    __tablename__ = "segments"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    speaker_id: Mapped[int | None] = mapped_column(ForeignKey("meeting_participants.id", ondelete="SET NULL"))
    start_sec: Mapped[float] = mapped_column(Float)
    end_sec: Mapped[float] = mapped_column(Float)
    text: Mapped[str] = mapped_column(Text)
    sentiment: Mapped[str] = mapped_column(String(10), default="neutral")  # positive | neutral | negative

    speaker = relationship("MeetingParticipant")


# ---- AI notes -----------------------------------------------------------

class Summary(Base):
    __tablename__ = "summaries"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), unique=True)
    overview: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of strings


class NoteSection(Base):
    __tablename__ = "note_sections"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer, default=0)

    bullets = relationship("NoteBullet", cascade="all, delete-orphan", order_by="NoteBullet.position")


class NoteBullet(Base):
    __tablename__ = "note_bullets"
    id: Mapped[int] = mapped_column(primary_key=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("note_sections.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text)
    timestamp_sec: Mapped[float | None] = mapped_column(Float)
    position: Mapped[int] = mapped_column(Integer, default=0)


class ActionItem(Base):
    __tablename__ = "action_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("meeting_participants.id", ondelete="SET NULL"))
    text: Mapped[str] = mapped_column(Text)
    timestamp_sec: Mapped[float | None] = mapped_column(Float)
    due_date: Mapped[datetime | None] = mapped_column(DateTime)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)

    assignee = relationship("MeetingParticipant")
    meeting = relationship("Meeting", viewonly=True)


# ---- collaboration ------------------------------------------------------

class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    segment_id: Mapped[int] = mapped_column(ForeignKey("segments.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    user = relationship("User")
    segment = relationship("Segment")


class Soundbite(Base):
    """A shareable clip: a time range with a title."""
    __tablename__ = "soundbites"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    start_sec: Mapped[float] = mapped_column(Float)
    end_sec: Mapped[float] = mapped_column(Float)
    title: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Bookmark(Base):
    """A single moment worth coming back to."""
    __tablename__ = "bookmarks"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    time_sec: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# ---- AI chat and logging ------------------------------------------------

class ChatMessage(Base):
    """Ask Sidenote history. meeting_id is NULL for the global chat."""
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    sources: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of transcript line ids the answer drew on
    provider: Mapped[str | None] = mapped_column(String(30))  # who wrote an assistant message
    model: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AiRun(Base):
    """One row per LLM call. Kept even if the meeting is deleted."""
    __tablename__ = "ai_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meetings.id", ondelete="SET NULL"))
    task: Mapped[str] = mapped_column(String(20))  # summarize | ask
    provider: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(80))
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10))  # ok | fallback | error
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
