import pytest

from app.services.parser import parse, to_seconds

VTT = """WEBVTT

NOTE a comment block

1
00:00:01.000 --> 00:00:04.500
Maya: Welcome everyone.

2
00:00:05.000 --> 00:00:08.000
<v Arjun>Thanks, glad to be here.</v>
"""

TXT = """[00:00:03] Maya: Let's begin.
[00:00:10] Arjun: Sounds good.
"""


def test_vtt_with_both_speaker_styles_and_ignored_blocks():
    lines = parse(VTT, "call.vtt")
    assert [(l.speaker, l.start, l.end) for l in lines] == [("Maya", 1.0, 4.5), ("Arjun", 5.0, 8.0)]
    assert lines[1].text.startswith("Thanks")


def test_txt_with_timestamps():
    lines = parse(TXT)
    assert [(l.speaker, l.start) for l in lines] == [("Maya", 3.0), ("Arjun", 10.0)]
    assert lines[0].end <= 10.0  # a line never runs into the next


def test_txt_without_timestamps_gets_made_up_timing():
    lines = parse("Maya: First point here.\nArjun: Second point here.")
    assert lines[0].start == 0.0
    assert lines[0].end <= lines[1].start
    assert lines[1].end > lines[1].start


def test_plain_paragraphs_get_a_default_speaker():
    lines = parse("Just some words.\n\nMore words after.")
    assert {l.speaker for l in lines} == {"Speaker 1"}
    assert len(lines) == 2


def test_json_list_and_segments_object():
    data = '[{"speaker": "Maya", "start": 2, "text": "Hi"}, {"speaker": "Arjun", "start": "00:05", "end": 7, "text": "Hello"}]'
    lines = parse(data)
    assert [(l.speaker, l.start, l.end) for l in lines][1] == ("Arjun", 5.0, 7.0)
    assert len(parse('{"segments": [{"start": 1, "text": "Hi"}]}')) == 1


def test_timestamp_formats():
    assert to_seconds("01:23") == 83
    assert to_seconds("00:01:23.500") == 83.5
    assert to_seconds("1:00:00") == 3600
    assert to_seconds(7) == 7.0


@pytest.mark.parametrize("bad", ["", "   \n\n ", "WEBVTT\n", "[]"])
def test_empty_input_is_rejected(bad):
    with pytest.raises(ValueError):
        parse(bad)


@pytest.mark.parametrize("bad", ['[{"text": "no start"}]', '[{"start": "soon", "text": "x"}]', '{"a": 1}', "[1, 2]"])
def test_bad_json_is_rejected_with_a_clear_message(bad):
    with pytest.raises(ValueError):
        parse(bad)


def test_windows_line_endings_and_bom():
    lines = parse("﻿[00:00:01] Maya: Hi\r\n[00:00:05] Arjun: Hey\r\n")
    assert [l.speaker for l in lines] == ["Maya", "Arjun"]


def test_unicode_and_colons_inside_text():
    lines = parse("[00:00:01] María: Meet at 10:30 — café ☕")
    assert lines[0].speaker == "María" and lines[0].text == "Meet at 10:30 — café ☕"


def test_out_of_order_timestamps_never_produce_negative_length():
    lines = parse("[00:00:10] A: one\n[00:00:05] B: two")
    assert all(l.end >= l.start for l in lines)
