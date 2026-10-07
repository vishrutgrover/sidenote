"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import styles from "./NewMeetingModal.module.css";

const MAX_BYTES = 2_000_000; // the server's limit; checking here gives an instant answer
const ACCEPT = ".txt,.vtt,.json";

type Props = { open: boolean; onClose: () => void; start?: "file" | "text"; onCreated?: (m: Meeting) => void };

/** Add a meeting from a transcript file (.txt, .vtt, .json) or pasted text. The notes are written in the background. */
export function NewMeetingModal({ open, onClose, start, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Add a meeting" wide>
      <NewMeetingForm start={start} onClose={onClose} onCreated={onCreated} />
    </Modal>
  );
}

// the form lives inside the modal, so everything typed is forgotten when it closes
function NewMeetingForm({ onClose, start = "file", onCreated }: Omit<Props, "open">) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"file" | "text">(start);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    setError(f.size > MAX_BYTES ? "That file is larger than 2 MB." : /\.(txt|vtt|json)$/i.test(f.name) ? "" : "Please choose a .txt, .vtt or .json transcript.");
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("title", title);
    if (mode === "file" && file) body.set("file", file);
    else body.set("transcript", text);
    try {
      const meeting = await api<Meeting>("/api/meetings", { method: "POST", body });
      toast("Meeting added. Writing the notes now…");
      onCreated?.(meeting);
      onClose();
      router.push(`/view/${meeting.id}`);
    } catch (err) {
      setError((err as Error).message); // e.g. "No transcript lines found"
    } finally {
      setBusy(false);
    }
  }

  const ready = mode === "file" ? !!file && !error : text.trim().length > 0;
  return (
    <>
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.tabs} role="tablist">
          {(["file", "text"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? styles.on : ""} onClick={() => { setMode(m); setError(""); }}>
              {m === "file" ? "Upload file" : "Paste text"}
            </button>
          ))}
        </div>

        <label className={styles.field}>
          <span>Title <span className="muted">(optional)</span></span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="E.g. Product team sync" maxLength={200} />
        </label>

        {mode === "file" ? (
          <label
            className={`${styles.drop} ${dragging ? styles.dragging : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
          >
            <FileUp size={26} color="var(--primary)" />
            <strong>{file ? file.name : "Drop a transcript here, or browse"}</strong>
            <span className="muted">.txt, .vtt or .json, up to 2 MB</span>
            <input type="file" accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0])} aria-label="Transcript file" />
          </label>
        ) : (
          <label className={styles.field}>
            Transcript
            <textarea className="input" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={"[00:00:05] Ana: Welcome everyone.\n[00:00:12] Ben: Thanks for joining."} aria-label="Transcript text" />
            <span className="muted">One line per speaker turn: <code>[hh:mm:ss] Name: text</code>. Without timestamps, timing is estimated.</span>
          </label>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.footer}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!ready || busy}>{busy ? <><Loader2 size={14} className={styles.spin} /> Adding…</> : "Add meeting"}</button>
        </div>
      </form>
    </>
  );
}
