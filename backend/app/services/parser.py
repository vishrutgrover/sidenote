"""Turn an uploaded or pasted transcript (.vtt, .json or text) into timed lines."""
import json
import re
from dataclasses import dataclass

WORDS_PER_SEC = 2.8  # used to guess how long a line takes when the file has no end time
PAUSE_SEC = 1.5  # gap placed between lines when the file has no timestamps

TIME = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d+))?")
SPEAKER = re.compile(r"^(?:<v ([^>]+)>|([^:\[\]<>]{1,40}):\s+)(.*)$", re.S)


@dataclass
class Line:
    speaker: str
    start: float
    end: float
    text: str


def to_seconds(value) -> float:
    """Accepts 83, "83.5", "01:23", "00:01:23.500" or a regex match of those."""
    if isinstance(value, (int, float)):
        return float(value)
    m = TIME.fullmatch(value.strip())
    if not m:
        return float(value)
    h, mins, secs, frac = m.groups()
    return int(h or 0) * 3600 + int(mins) * 60 + int(secs) + (float(f"0.{frac}") if frac else 0)


def split_speaker(text: str) -> tuple[str, str]:
    m = SPEAKER.match(text.strip())
    if m:
        return (m.group(1) or m.group(2)).strip(), m.group(3).strip()
    return "Speaker 1", text.strip()


def parse_vtt(text: str) -> list[tuple]:
    raw = []
    for block in re.split(r"\n\s*\n", text):
        lines = block.strip().split("\n")
        i = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if i is None:
            continue  # header, NOTE block, etc.
        start, end = (to_seconds(m.group(0)) for m in TIME.finditer(lines[i]))
        speaker, body = split_speaker(" ".join(lines[i + 1:]))
        if body:
            raw.append((speaker, start, end, body))
    return raw


def parse_txt(text: str) -> list[tuple]:
    raw = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        m = re.match(rf"\[?({TIME.pattern})\]?\s*(.*)$", line)
        start, rest = (to_seconds(m.group(1)), m.group(6)) if m else (None, line)
        speaker, body = split_speaker(rest)
        if body:
            raw.append((speaker, start, None, body))
    return raw


def parse_json(data) -> list[tuple]:
    items = data.get("segments") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise ValueError("JSON must be a list of lines or an object with a 'segments' list")
    raw = []
    for item in items:
        try:
            end = item.get("end")
            raw.append((
                str(item.get("speaker") or item.get("name") or "Speaker 1"),
                to_seconds(item["start"]),
                None if end is None else to_seconds(end),
                str(item["text"]).strip(),
            ))
        except (KeyError, TypeError, ValueError, AttributeError):
            raise ValueError(f"Bad transcript line: {item!r}") from None
    return raw


def finish(raw: list[tuple]) -> list[Line]:
    """Fill in missing start and end times and stop lines overlapping the next one."""
    if not raw:
        raise ValueError("No transcript lines found")
    lines, t = [], 0.0
    for i, (speaker, start, end, text) in enumerate(raw):
        start = t if start is None else start
        if end is None:
            end = start + max(len(text.split()) / WORDS_PER_SEC, 1.0)
        next_start = raw[i + 1][1] if i + 1 < len(raw) else None
        if next_start is not None:
            end = min(end, next_start)
        end = max(end, start)
        lines.append(Line(speaker, round(start, 1), round(end, 1), text))
        t = end + PAUSE_SEC
    return lines


def parse(content: str, filename: str = "") -> list[Line]:
    content = content.lstrip("\ufeff").replace("\r\n", "\n").strip()
    name = filename.lower()
    data = None
    if name.endswith(".json") or content[:1] in "[{":
        try:
            data = json.loads(content)
        except ValueError:
            if name.endswith(".json"):
                raise ValueError("Invalid JSON file") from None
            # not JSON after all, e.g. a text line starting with [00:01]
    if data is not None:
        raw = parse_json(data)
    elif name.endswith(".vtt") or content.startswith("WEBVTT"):
        raw = parse_vtt(content)
    else:
        raw = parse_txt(content)
    return finish(raw)
