"use client";
import { useRef, useState } from "react";
import { CalendarPlus, ChevronDown, ClipboardPaste, Mic, Upload, Video } from "lucide-react";
import { useDismiss } from "@/lib/hooks";
import { NewMeetingModal } from "./NewMeetingModal";
import { useToast } from "./Toast";
import styles from "./CaptureMenu.module.css";

/** The purple Capture button. Uploading or pasting a transcript works; live capture is a placeholder. */
export function CaptureMenu() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"file" | "text" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  const soon = (what: string) => () => {
    setOpen(false);
    toast(`${what} is coming soon`);
  };
  const choose = (mode: "file" | "text") => () => {
    setOpen(false);
    setModal(mode);
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <div className={styles.split}>
        <button className={styles.main} onClick={choose("file")}><Video size={16} /> Capture</button>
        <button className={styles.arrow} onClick={() => setOpen(!open)} aria-label="More ways to add a meeting" aria-haspopup="menu" aria-expanded={open}><ChevronDown size={16} /></button>
      </div>
      {open && (
        <div className={styles.menu} role="menu">
          <button role="menuitem" onClick={choose("file")}><Upload size={15} /> Upload transcript file</button>
          <button role="menuitem" onClick={choose("text")}><ClipboardPaste size={15} /> Paste transcript</button>
          <hr />
          <button role="menuitem" onClick={soon("Adding to a live meeting")}><Video size={15} /> Add to live meeting <small>Soon</small></button>
          <button role="menuitem" onClick={soon("Scheduling")}><CalendarPlus size={15} /> Schedule new meeting <small>Soon</small></button>
          <button role="menuitem" onClick={soon("Recording")}><Mic size={15} /> Start recording <small>Soon</small></button>
        </div>
      )}
      <NewMeetingModal open={modal !== null} start={modal ?? "file"} onClose={() => setModal(null)} />
    </div>
  );
}
