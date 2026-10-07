"use client";
import { Link2 } from "lucide-react";
import { dateTimeLabel } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

/** Sharing with other people is not built; the link itself works. */
export function ShareModal({ meeting, open, onClose }: { meeting: Meeting; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/view/${meeting.id}`);
      toast("Link copied");
    } catch {
      toast("Could not copy. The browser blocked it.", "error");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={meeting.title}>
      <p className="muted">{meeting.participants.find((p) => p.is_host)?.name} · {dateTimeLabel(meeting.started_at)}</p>
      <div className="empty" style={{ padding: "28px 0" }}>
        <strong>Sharing with teammates is coming soon</strong>
        <p>For now you can copy the link to this meeting.</p>
      </div>
      <button className="btn btn-primary" onClick={copy} style={{ width: "100%" }}><Link2 size={14} /> Copy link</button>
    </Modal>
  );
}
