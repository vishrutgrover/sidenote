import csv
import io
import json

import pytest

from app.models import User
from app.services import exporter
from app.services.meetings import create_from_lines
from app.services.parser import parse

TEXT = (
    '[00:00:01] Ana: Hello, "team"\n'
    "[00:00:05] Ben: =SUM(A1) is not a formula\n"
    "[00:01:05] Ana: Naïve café ☕ 日本語"
)


@pytest.fixture
def m(db):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    return create_from_lines(db, user, "Launch / Plan: Q4!", parse(TEXT), "paste")


def text(m, what, fmt, **kw):
    return exporter.build(m, what, fmt, **kw)[0].decode("utf-8")


# ---- transcript formats ------------------------------------------------------------

def test_txt(m):
    assert text(m, "transcript", "txt").splitlines()[0] == '[00:01] Ana: Hello, "team"'
    assert text(m, "transcript", "txt", timestamps=False, speakers=False).splitlines()[0] == 'Hello, "team"'


def test_srt_has_numbered_cues_with_comma_milliseconds(m):
    cues = text(m, "transcript", "srt").split("\n\n")
    assert cues[0].startswith("1\n00:00:01,000 --> 00:00:0")
    assert "Ana: Hello" in cues[0] and cues[2].startswith("3\n00:01:05,000")
    assert "Ana:" not in text(m, "transcript", "srt", speakers=False)


def test_srt_cue_is_never_zero_length(m):
    m.segments[0].end_sec = m.segments[0].start_sec
    assert "00:00:01,000 --> 00:00:01,500" in text(m, "transcript", "srt")


def test_srt_time_formatting():
    assert exporter.srt_time(3725.5) == "01:02:05,500" and exporter.srt_time(0) == "00:00:00,000"
    assert exporter.srt_time(59.9996) == "00:01:00,000"  # rounds up cleanly, no 60 seconds


def test_csv_round_trips_commas_quotes_and_unicode(m):
    rows = list(csv.reader(io.StringIO(text(m, "transcript", "csv"))))
    assert rows[0] == ["speaker", "start_sec", "end_sec", "text"]
    assert rows[1][3] == 'Hello, "team"' and rows[3][3] == "Naïve café ☕ 日本語"


def test_csv_neutralises_spreadsheet_formulas(m):
    rows = list(csv.reader(io.StringIO(text(m, "transcript", "csv"))))
    assert rows[2][3] == "'=SUM(A1) is not a formula"


def test_csv_columns_follow_the_options(m):
    assert list(csv.reader(io.StringIO(text(m, "transcript", "csv", timestamps=False, speakers=False))))[0] == ["text"]


def test_json_options_and_unicode(m):
    full = json.loads(text(m, "transcript", "json"))
    assert full["title"] == "Launch / Plan: Q4!" and full["participants"] == ["Ana", "Ben"]
    assert full["lines"][0] == {"text": 'Hello, "team"', "speaker": "Ana", "start": 1.0, "end": full["lines"][0]["end"]}
    assert "日本語" in text(m, "transcript", "json")  # not escaped to \uXXXX
    bare = json.loads(text(m, "transcript", "json", timestamps=False, speakers=False))
    assert bare["lines"][0] == {"text": 'Hello, "team"'}


def test_markdown_transcript(m):
    md = text(m, "transcript", "md")
    assert md.startswith("# Launch / Plan: Q4!\n") and "**Ana 00:01** Hello" in md
    assert "**" not in text(m, "transcript", "md", timestamps=False, speakers=False).split("\n\n", 2)[2]


# ---- pdf -------------------------------------------------------------------------------

@pytest.mark.parametrize("what", ["transcript", "summary"])
def test_pdf_is_a_real_pdf_even_with_text_the_builtin_font_cannot_draw(m, what):
    data, media = exporter.build(m, what, "pdf")
    assert media == "application/pdf" and data.startswith(b"%PDF-") and len(data) > 800


def test_pdf_survives_markup_like_text(db):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    nasty = create_from_lines(db, user, "<b>Bold</b> & <script>", parse("A: <b>unclosed & <i> tags </ >"), "paste")
    assert exporter.build(nasty, "transcript", "pdf")[0].startswith(b"%PDF-")


def test_pdf_with_a_very_long_transcript(db):
    user = User(name="Me", email="me@example.com")
    db.add(user)
    db.flush()
    big = create_from_lines(db, user, "Big", parse("\n".join(f"A: line number {i} " + "word " * 40 for i in range(400))), "paste")
    assert len(exporter.build(big, "transcript", "pdf")[0]) > 5000


# ---- summary ---------------------------------------------------------------------------------

def test_summary_for_a_meeting_without_notes_is_valid_and_empty(m):
    d = json.loads(text(m, "summary", "json"))
    assert d["overview"] == "" and d["sections"] == [] and d["action_items"] == {}
    assert text(m, "summary", "md").startswith("# Launch / Plan: Q4!")


def test_summary_markdown_with_notes_and_tasks(m, db):
    from app.services import ai
    ai.generate_notes(db, m)
    md = text(m, "summary", "md")
    assert "## Overview" in md and "## Notes" in md
    with_ts = text(m, "summary", "md")
    without = text(m, "summary", "md", timestamps=False)
    assert "(00:" in with_ts and "(00:" not in without


def test_action_items_are_grouped_by_person_with_checkboxes(m, db):
    from app.models import ActionItem
    ben = m.participants[1]
    db.add_all([ActionItem(meeting_id=m.id, assignee_id=ben.id, text="Ship it", timestamp_sec=5, is_done=True),
                ActionItem(meeting_id=m.id, text="Nobody owns this")])
    db.commit()
    db.refresh(m)
    md = text(m, "summary", "md")
    assert "### Ben\n- [x] Ship it (00:05)" in md and "### Unassigned\n- [ ] Nobody owns this" in md


# ---- guards ------------------------------------------------------------------------------------

@pytest.mark.parametrize("what,fmt", [("summary", "srt"), ("summary", "csv"), ("summary", "txt"), ("transcript", "docx"), ("notes", "md")])
def test_formats_a_content_type_does_not_offer_are_refused(m, what, fmt):
    with pytest.raises(ValueError):
        exporter.build(m, what, fmt)


@pytest.mark.parametrize("title,expected", [("Weekly Product Sync", "weekly-product-sync-transcript.md"),
                                             ("  ../../etc/passwd ", "etc-passwd-transcript.md"),
                                             ("日本語", "meeting-transcript.md"), ('a"b\r\nc', "a-b-c-transcript.md")])
def test_filenames_are_safe_ascii(m, title, expected):
    m.title = title
    assert exporter.filename(m, "transcript", "md") == expected
