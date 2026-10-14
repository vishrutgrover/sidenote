"""Ask Sidenote: answer a question about one meeting, or about all of them (meeting=None)."""
import json
import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import ActionItem, ChatMessage, Meeting, MeetingParticipant, Segment, User
from . import ai
from .llm import registry
from .search import top_segments

ASK_SYSTEM = (
    "You answer questions about meetings using only the transcript provided. "
    "Cite the moments you rely on as [mm:ss], one bracket per moment. Write plain sentences and short '- ' bullets, no headings. If the transcript does not contain the answer, say so plainly. Be concise. "
    "If the question is not about the meetings, say you can only help with them. "
    "When a list of meetings comes first, use its dates to tell which is newest or oldest."
    + ai.GUARDRAILS
)
HISTORY_TURNS = 6
TIME_REF = re.compile(r"(\d+):(\d{2})")
CITATION = re.compile(r"\[(\d+:\d{2}(?:,\s*\d+:\d{2})*)\]")  # [01:23] or [00:25, 01:14]
SUMMARY_Q = re.compile(r"summar|overview|recap", re.I)
TASKS_Q = re.compile(r"action item|to-?dos?|tasks?", re.I)


def scope(meeting: Meeting | None):
    """SQL condition for 'messages of this chat'."""
    return ChatMessage.meeting_id == meeting.id if meeting else ChatMessage.meeting_id.is_(None)


def recent_messages(db: Session, meeting: Meeting | None, n: int) -> list[ChatMessage]:
    rows = db.scalars(select(ChatMessage).where(scope(meeting)).order_by(ChatMessage.id.desc()).limit(n)).all()
    return rows[::-1]


def seg_line(db: Session, seg, show_meeting: bool) -> str:
    who = seg.speaker.person.name if seg.speaker else "Unknown"
    title = f"{db.get(Meeting, seg.meeting_id).title} @ " if show_meeting else ""
    return f"[{title}{ai.clock(seg.start_sec)}] {who}: {seg.text}"


def meetings_header(db: Session, limit: int = 20) -> str:
    """One line per meeting, newest first, so the model can answer 'my last meeting' and 'what was each about'."""
    rows = db.scalars(select(Meeting).order_by(Meeting.started_at.desc()).limit(limit)).all()
    return "\n".join(f"- {m.title} ({m.started_at:%Y-%m-%d}), with {', '.join(p.person.name for p in m.participants)}: "
                      f"{(m.summary.overview if m.summary else 'no notes yet')[:300]}" for m in rows)


def attendance(db: Session, user: User) -> str:
    """'Vishrut attended 5 of 7 meetings.' Counted here, because the model only sees some of the meetings."""
    total = db.scalar(select(func.count(Meeting.id)))
    went = db.scalar(select(func.count(MeetingParticipant.id)).where(MeetingParticipant.person_id == user.person_id)) if user.person_id else 0
    return f"{user.name} attended {went} of {total} meetings.\n"


def task_time(a: ActionItem) -> str:
    """', at 01:09' for a task taken from a transcript line. Tasks added by hand have no time."""
    return f", at {ai.clock(a.timestamp_sec)}" if a.timestamp_sec is not None else ""


def task_sources(db: Session, tasks: list[ActionItem]) -> list[int]:
    """The transcript line each task came from (the last one that had started at its time), so the answer can link to it."""
    ids = []
    for a in tasks:
        if a.timestamp_sec is None:
            continue
        seg = db.scalar(select(Segment).where(Segment.meeting_id == a.meeting_id, Segment.start_sec <= a.timestamp_sec + 1)
                        .order_by(Segment.start_sec.desc()).limit(1))
        if seg and seg.id not in ids:
            ids.append(seg.id)
    return ids


def my_tasks(db: Session, user: User | None) -> list[ActionItem]:
    """Open tasks whose assignee is the person the logged-in user is."""
    if not user or user.person_id is None:
        return []
    return list(db.scalars(select(ActionItem).join(MeetingParticipant, ActionItem.assignee_id == MeetingParticipant.id)
                           .where(MeetingParticipant.person_id == user.person_id, ActionItem.is_done.is_(False))))


def cited_line_ids(meeting: Meeting, answer: str) -> list[int]:
    """Lines whose time the answer mentions, e.g. [02:40], so the page can link to them."""
    ids = []
    for m in (t for c in CITATION.findall(answer) for t in TIME_REF.finditer(c)):
        t = int(m.group(1)) * 60 + int(m.group(2))
        seg = max((s for s in meeting.segments if s.start_sec < t + 1), key=lambda s: s.start_sec, default=None)
        if seg and seg.id not in ids:
            ids.append(seg.id)
    return ids


def builtin_answer(db: Session, meeting: Meeting | None, question: str, user: User | None = None) -> tuple[str, list[int]]:
    """No AI: recognise 'summary' and 'tasks' questions, otherwise quote the most relevant lines."""
    if SUMMARY_Q.search(question):
        if meeting:
            return (meeting.summary.overview if meeting.summary and meeting.summary.overview else "There are no notes for this meeting yet."), []
        recent = db.scalars(select(Meeting).order_by(Meeting.started_at.desc()).limit(3)).all()
        return "\n".join(f"- {m.title}: {m.summary.overview if m.summary else 'no notes yet'}" for m in recent), []
    if TASKS_Q.search(question):
        mine = re.search(r"\b(my|mine|me|i)\b", question, re.I) is not None
        items = meeting.action_items if meeting else my_tasks(db, user) if mine else db.scalars(select(ActionItem).where(ActionItem.is_done.is_(False)).limit(10)).all()
        if not items:
            return "There are no action items.", []
        return "\n".join(
            f"- [{'x' if a.is_done else ' '}] {a.text}" + (f" ({a.assignee.person.name})" if a.assignee else "")
            + ("" if meeting else f" - {a.meeting.title}") + (f" [{ai.clock(a.timestamp_sec)}]" if a.timestamp_sec is not None else "") for a in items), ([] if meeting else task_sources(db, items))
    hits = top_segments(db, question, meeting.id if meeting else None, limit=5)
    if not hits:
        return f"I couldn't find anything about that in {'this meeting' if meeting else 'your meetings'}. Try other keywords.", []
    lines = [f"- {seg_line(db, s, not meeting)}" if len(s.text) <= 220 else f"- {seg_line(db, s, not meeting)[:220].rstrip()}…" for s in hits]
    return "Here is what the transcript says:\n" + "\n".join(lines), [s.id for s in hits]


def ask(db: Session, meeting: Meeting | None, question: str, provider_name: str | None, model_name: str | None, user: User | None = None):
    """Answer, store both messages, return (user_message, assistant_message, ai_info).
    Raises ProviderUnavailable (before anything is stored) if the chosen provider is not configured."""
    provider, model = registry.resolve(provider_name, model_name)
    prior = recent_messages(db, meeting, HISTORY_TURNS)

    def run_llm():
        if meeting:
            context = "\n".join(seg_line(db, s, False) for s in meeting.segments)[: ai.MAX_PROMPT_CHARS]
            hits = None
        else:  # all meetings will not fit in one prompt, so send the lines most relevant to the question
            hits = top_segments(db, question, None, limit=20)
            context = f"Meetings, newest first:\n{meetings_header(db)}\n\nRelevant lines:\n" + "\n".join(seg_line(db, s, True) for s in hits)
        chat = "".join(f"{m.role}: {m.content}\n" for m in prior)
        who = f"The person asking is {user.name}; \"I\", \"me\" and \"my\" mean {user.name}.\n" if user else ""
        if user and not meeting:
            who += attendance(db, user)
        tasks = my_tasks(db, user)
        mine = f"Open tasks for {user.name}:\n" + "\n".join(f"- {a.text} ({a.meeting.title}{task_time(a)})" for a in tasks) + "\n\n" if tasks else ""
        prompt = who + mine + f"Transcript:\n{context}\n\n" + (f"Conversation so far:\n{chat}\n" if chat else "") + f"Question: {question}"
        reply = provider.complete(ASK_SYSTEM, prompt, model).strip()
        if not reply:
            raise ValueError("empty reply")
        if meeting:
            return reply, cited_line_ids(meeting, reply)
        return reply, (task_sources(db, tasks) if tasks and TASKS_Q.search(question) else []) or [s.id for s in hits[:5]]

    (answer, source_ids), info = ai.call(
        db, meeting.id if meeting else None, "ask", provider, model,
        run_llm=run_llm, run_mock=lambda: builtin_answer(db, meeting, question, user),
    )
    wrote_it = info["provider"] if info["status"] == "ok" else "mock"  # on fallback the built-in logic wrote the answer
    user = ChatMessage(meeting_id=meeting.id if meeting else None, role="user", content=question)
    bot = ChatMessage(meeting_id=user.meeting_id, role="assistant", content=answer, sources=json.dumps(source_ids),
                      provider=wrote_it, model=info["model"] if wrote_it == info["provider"] else "heuristic")
    db.add_all([user, bot])
    db.commit()
    return user, bot, info
