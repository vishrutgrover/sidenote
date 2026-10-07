"""Download a meeting's transcript or notes as a file.

Both are first turned into a short list of blocks (kind, bold_prefix, text), and the markdown and PDF
writers just walk that list. kind is one of h1, h2, h3, p, li."""
import csv
import io
import json
import re
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer

from ..models import Meeting
from .ai import clock

TRANSCRIPT_FORMATS = ("pdf", "md", "txt", "json", "srt", "csv")
SUMMARY_FORMATS = ("pdf", "md", "json")
MEDIA = {"pdf": "application/pdf", "md": "text/markdown", "txt": "text/plain", "json": "application/json",
         "srt": "application/x-subrip", "csv": "text/csv"}


def speaker_name(seg) -> str:
    return seg.speaker.person.name if seg.speaker else "Unknown"


def srt_time(sec: float) -> str:
    ms = round(sec * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def spreadsheet_safe(value):
    """A cell starting with = + - @ would run as a formula when the CSV is opened in Excel."""
    return "'" + value if isinstance(value, str) and value[:1] in "=+-@" else value


def meta_line(m: Meeting) -> str:
    people = ", ".join(p.person.name for p in m.participants)
    return f"{m.started_at:%b %d, %Y %H:%M} · {m.duration_sec // 60} min · {people}"


# ---- transcript -------------------------------------------------------------------

def transcript_blocks(m: Meeting, timestamps: bool, speakers: bool) -> list[tuple]:
    blocks = [("h1", "", m.title), ("p", "", meta_line(m))]
    for s in m.segments:
        prefix = " ".join(x for x in (speaker_name(s) if speakers else "", clock(s.start_sec) if timestamps else "") if x)
        blocks.append(("p", prefix, s.text))
    return blocks


def transcript_txt(m: Meeting, timestamps: bool, speakers: bool) -> str:
    return "".join(
        (f"[{clock(s.start_sec)}] " if timestamps else "") + (f"{speaker_name(s)}: " if speakers else "") + s.text + "\n"
        for s in m.segments
    )


def transcript_json(m: Meeting, timestamps: bool, speakers: bool) -> str:
    def row(s):
        r = {"text": s.text}
        if speakers:
            r["speaker"] = speaker_name(s)
        if timestamps:
            r["start"], r["end"] = s.start_sec, s.end_sec
        return r
    return json.dumps({"title": m.title, "started_at": m.started_at.isoformat(), "duration_sec": m.duration_sec,
                       "participants": [p.person.name for p in m.participants], "lines": [row(s) for s in m.segments]},
                      indent=2, ensure_ascii=False)


def transcript_srt(m: Meeting, speakers: bool) -> str:
    """Subtitles are timed by nature, so the timestamps option does not apply."""
    cues = []
    for i, s in enumerate(m.segments, 1):
        text = f"{speaker_name(s)}: {s.text}" if speakers else s.text
        cues.append(f"{i}\n{srt_time(s.start_sec)} --> {srt_time(max(s.end_sec, s.start_sec + 0.5))}\n{text}\n")
    return "\n".join(cues)


def transcript_csv(m: Meeting, timestamps: bool, speakers: bool) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow((["speaker"] if speakers else []) + (["start_sec", "end_sec"] if timestamps else []) + ["text"])
    for s in m.segments:
        w.writerow(([spreadsheet_safe(speaker_name(s))] if speakers else []) + ([s.start_sec, s.end_sec] if timestamps else [])
                   + [spreadsheet_safe(s.text)])
    return out.getvalue()


# ---- summary ------------------------------------------------------------------------

def summary_data(m: Meeting, timestamps: bool) -> dict:
    def at(t):
        return clock(t) if timestamps and t is not None else None
    people: dict[str, list] = {}
    for a in m.action_items:
        people.setdefault(a.assignee.person.name if a.assignee else "Unassigned", []).append(
            {"text": a.text, "done": a.is_done, "at": at(a.timestamp_sec)})
    return {
        "title": m.title,
        "overview": m.summary.overview if m.summary else "",
        "keywords": json.loads(m.summary.keywords) if m.summary else [],
        "sections": [{"title": s.title, "bullets": [{"text": b.text, "at": at(b.timestamp_sec)} for b in s.bullets]} for s in m.sections],
        "action_items": people,
    }


def summary_blocks(m: Meeting, timestamps: bool) -> list[tuple]:
    d = summary_data(m, timestamps)
    suffix = lambda at: f" ({at})" if at else ""  # noqa: E731
    blocks = [("h1", "", d["title"]), ("p", "", meta_line(m))]
    if d["overview"]:
        blocks += [("h2", "", "Overview"), ("p", "", d["overview"])]
    if d["keywords"]:
        blocks.append(("p", "Keywords:", ", ".join(d["keywords"])))
    if d["sections"]:
        blocks.append(("h2", "", "Notes"))
        for s in d["sections"]:
            blocks.append(("h3", "", s["title"]))
            blocks += [("li", "", b["text"] + suffix(b["at"])) for b in s["bullets"]]
    if d["action_items"]:
        blocks.append(("h2", "", "Action items"))
        for who, items in d["action_items"].items():
            blocks.append(("h3", "", who))
            blocks += [("li", "[x]" if i["done"] else "[ ]", i["text"] + suffix(i["at"])) for i in items]
    return blocks


# ---- writers ---------------------------------------------------------------------------

def blocks_to_md(blocks: list[tuple]) -> str:
    marks = {"h1": "# ", "h2": "## ", "h3": "### ", "p": "", "li": "- "}
    out = []
    for kind, prefix, text in blocks:
        body = f"**{prefix}** {text}" if prefix and kind == "p" else f"{prefix} {text}".strip()
        out.append(marks[kind] + body)
    return "\n\n".join(out).replace("\n\n- ", "\n- ") + "\n"  # list items stay together


def blocks_to_pdf(blocks: list[tuple]) -> bytes:
    def clean(text):  # the built-in PDF fonts only cover Western European text
        return escape(text.encode("cp1252", "replace").decode("cp1252"))
    styles = getSampleStyleSheet()
    flow, items = [], []

    def flush():
        if items:
            flow.append(ListFlowable(list(items), bulletType="bullet", leftIndent=14))
            items.clear()

    for kind, prefix, text in blocks:
        if kind == "li":
            label = f"<b>{clean(prefix)}</b> " if prefix else ""
            items.append(ListItem(Paragraph(label + clean(text), styles["BodyText"])))
            continue
        flush()
        style = {"h1": "Title", "h2": "Heading2", "h3": "Heading3", "p": "BodyText"}[kind]
        label = f"<b>{clean(prefix)}</b> " if prefix else ""
        flow += [Paragraph(label + clean(text), styles[style]), Spacer(1, 4)]
    flush()
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, title="Sidenote export").build(flow)
    return buf.getvalue()


def build(m: Meeting, what: str, fmt: str, timestamps: bool = True, speakers: bool = True) -> tuple[bytes, str]:
    """Returns (file bytes, media type). Raises ValueError for a format the chosen content does not offer."""
    if what == "transcript" and fmt in TRANSCRIPT_FORMATS:
        if fmt == "txt":
            text = transcript_txt(m, timestamps, speakers)
        elif fmt == "md":
            text = blocks_to_md(transcript_blocks(m, timestamps, speakers))
        elif fmt == "json":
            text = transcript_json(m, timestamps, speakers)
        elif fmt == "srt":
            text = transcript_srt(m, speakers)
        elif fmt == "csv":
            text = transcript_csv(m, timestamps, speakers)
        else:
            return blocks_to_pdf(transcript_blocks(m, timestamps, speakers)), MEDIA["pdf"]
    elif what == "summary" and fmt in SUMMARY_FORMATS:
        if fmt == "json":
            text = json.dumps(summary_data(m, timestamps), indent=2, ensure_ascii=False)
        elif fmt == "md":
            text = blocks_to_md(summary_blocks(m, timestamps))
        else:
            return blocks_to_pdf(summary_blocks(m, timestamps)), MEDIA["pdf"]
    else:
        raise ValueError(f"A {what} cannot be exported as {fmt}")
    return text.encode("utf-8"), MEDIA[fmt]


def filename(m: Meeting, what: str, fmt: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", m.title.lower()).strip("-") or "meeting"
    return f"{slug}-{what}.{fmt}"
