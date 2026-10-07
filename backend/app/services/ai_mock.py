"""Notes and answers without any API: word counts and a few phrase patterns.
Good enough for a demo and the fallback when a real provider fails.
Lines are (speaker, start_sec, text) tuples."""
import re
from collections import Counter

STOP = set(
    "the and but for with this that these those they them their there here what which who how when where "
    "have has had does did will would should could just about into over after before also very more most "
    "some any all out down get got going lets like then than from your you're we're that's it's i'll "
    "been being were was are our not yes yeah okay".split()
)
ACTION = re.compile(r"\b(i'll|i will|we need to|you need to|need to|should|can you|could you|please|action item)\b", re.I)
SELF_ASSIGNED = re.compile(r"\b(i'll|i will)\b", re.I)


def words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z']{4,}", text.lower()) if w not in STOP]


def first_sentence(text: str, limit: int = 140) -> str:
    s = re.split(r"(?<=[.!?])\s", text.strip())[0]
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"


def summarize(lines: list[tuple]) -> dict:
    texts = [t for _, _, t in lines]
    keywords = [w for w, _ in Counter(w for t in texts for w in words(t)).most_common(8)]
    n_speakers = len({s for s, _, _ in lines})
    topic = ", ".join(keywords[:3]) or "the agenda"
    overview = f"{n_speakers} participant{'s' * (n_speakers != 1)} discussed {topic}. {first_sentence(texts[0], 200)}"

    sections = []
    size = -(-len(lines) // 3)  # ceil, so there are at most three sections
    for part, start in enumerate(range(0, len(lines), size), 1):
        idx = list(range(start, min(start + size, len(lines))))
        top = [w for w, _ in Counter(w for i in idx for w in words(texts[i])).most_common(2)]
        longest = sorted(sorted(idx, key=lambda i: -len(texts[i]))[:2])
        sections.append({
            "title": " & ".join(w.capitalize() for w in top) or f"Part {part}",
            "bullets": [{"text": first_sentence(texts[i]), "line": i} for i in longest],
        })

    actions = [
        {"assignee": lines[i][0] if SELF_ASSIGNED.search(texts[i]) else None, "text": first_sentence(texts[i]), "line": i}
        for i in range(len(lines)) if ACTION.search(texts[i])
    ][:8]
    return {"overview": overview, "keywords": keywords, "sections": sections, "action_items": actions}
