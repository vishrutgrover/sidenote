from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response

from ..deps import get_meeting
from ..models import Meeting
from ..services import exporter

router = APIRouter(prefix="/api/meetings", tags=["export"])


@router.get("/{meeting_id}/export")
def export_meeting(
    what: Literal["transcript", "summary"],
    format: Literal["pdf", "md", "txt", "json", "srt", "csv"],
    timestamps: bool = True,
    speakers: bool = True,
    meeting: Meeting = Depends(get_meeting),
):
    """Transcript: pdf, md, txt, json, srt, csv. Summary: pdf, md, json.
    timestamps and speakers switch those parts off (speakers only applies to transcripts)."""
    try:
        content, media_type = exporter.build(meeting, what, format, timestamps, speakers)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    name = exporter.filename(meeting, what, format)
    return Response(content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{name}"'})
