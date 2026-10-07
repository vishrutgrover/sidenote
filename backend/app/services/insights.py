"""Numbers for the Smart Search panel. All computed from the transcript when asked, never stored."""
import re

from ..models import Meeting

NUMBERS = re.compile(r"\d|\bpercent\b|\b(?:million|thousand|hundred)\b", re.I)
DATES = re.compile(
    r"\b(?:today|tomorrow|yesterday|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday"
    r"|january|february|march|april|may|june|july|august|september|october|november|december"
    r"|next week|next sprint|this week|q[1-4])\b|\b\d{1,2}:\d{2}\b",
    re.I,
)


def compute(meeting: Meeting) -> dict:
    segments = meeting.segments
    sentiments = {"positive": 0, "neutral": 0, "negative": 0}
    for s in segments:
        sentiments[s.sentiment] = sentiments.get(s.sentiment, 0) + 1
    total = len(segments) or 1

    talk = {}  # seat id -> [seconds, words]
    for s in segments:
        t = talk.setdefault(s.speaker_id, [0.0, 0])
        t[0] += s.end_sec - s.start_sec
        t[1] += len(s.text.split())
    all_talk = sum(t[0] for t in talk.values()) or 1
    seats = {p.id: p for p in meeting.participants}
    speakers = [
        {
            "participant_id": sid,
            "name": seats[sid].person.name if sid in seats else "Unknown",
            "color": seats[sid].color if sid in seats else "#999999",
            "talk_sec": round(sec, 1),
            "share_pct": round(100 * sec / all_talk),
            "wpm": round(words / (sec / 60)) if sec else 0,
        }
        for sid, (sec, words) in sorted(talk.items(), key=lambda kv: -kv[1][0])
    ]

    return {
        "sentiments": {k: {"count": v, "pct": round(100 * v / total)} for k, v in sentiments.items()},
        "speakers": speakers,
        "filters": {
            "questions": [s.id for s in segments if "?" in s.text],
            "metrics": [s.id for s in segments if NUMBERS.search(s.text)],
            "dates_times": [s.id for s in segments if DATES.search(s.text)],
            "tasks": [a.id for a in meeting.action_items],
        },
    }
