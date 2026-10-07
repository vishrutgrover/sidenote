"use client";
import { useRef, useState } from "react";
import { Download, Link2, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { useDismiss } from "@/lib/hooks";
import type { Meeting } from "@/lib/types";
import { ConfirmDelete } from "./ConfirmDelete";
import { EditMeetingModal } from "./EditMeetingModal";
import { ExportModal } from "./ExportModal";
import { ShareModal } from "./ShareModal";
import { useToast } from "./Toast";
import styles from "./MeetingMenu.module.css";

type Props = { meeting: Meeting; onChanged: () => void; onDeleted: () => void };

/** The "..." menu for one meeting: share, copy link, download, rename and edit people, delete. */
export function MeetingMenu({ meeting, onChanged, onDeleted }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"share" | "edit" | "delete" | "download" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/view/${meeting.id}`);
      toast("Link copied");
    } catch {
      toast("Could not copy. The browser blocked it.", "error");
    }
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button className="btn btn-icon" onClick={() => setOpen(!open)} aria-label={`Actions for ${meeting.title}`} aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button role="menuitem" onClick={choose(() => setDialog("share"))}><Share2 size={15} /> Share</button>
          <button role="menuitem" onClick={choose(copyLink)}><Link2 size={15} /> Copy link</button>
          <button role="menuitem" onClick={choose(() => setDialog("download"))}><Download size={15} /> Download</button>
          <button role="menuitem" onClick={choose(() => setDialog("edit"))}><Pencil size={15} /> Rename and people</button>
          <hr />
          <button role="menuitem" className={styles.danger} onClick={choose(() => setDialog("delete"))}><Trash2 size={15} /> Delete</button>
        </div>
      )}
      <ExportModal meetingId={meeting.id} open={dialog === "download"} onClose={() => setDialog(null)} />
      <ShareModal meeting={meeting} open={dialog === "share"} onClose={() => setDialog(null)} />
      <EditMeetingModal meeting={meeting} open={dialog === "edit"} onClose={() => setDialog(null)} onSaved={onChanged} />
      <ConfirmDelete meeting={meeting} open={dialog === "delete"} onClose={() => setDialog(null)} onDeleted={onDeleted} />
    </div>
  );
}
