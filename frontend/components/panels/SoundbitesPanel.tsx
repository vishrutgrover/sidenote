"use client";
import { useState } from "react";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { api, send } from "@/lib/api";
import { clock, parseClock } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import type { Soundbite } from "@/lib/types";
import { useToast } from "../Toast";
import styles from "../panels.module.css";

export type SoundbiteDraft = { id: number; start: number; end: number };
type Props = { meetingId: number; duration: number; time: number; draft: SoundbiteDraft | null; onDraftDone: () => void; onPlay: (start: number, end: number) => void; onSeek: (sec: number) => void };

/** Short clips of the meeting with a title: make one from a transcript line or from the current moment. */
export function SoundbitesPanel({ meetingId, duration, time, draft, onDraftDone, onPlay, onSeek }: Props) {
  const toast = useToast();
  const { data: bites = [], reload } = useFetch<Soundbite[]>(`/api/meetings/${meetingId}/soundbites`);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);
  const composing = adding || draft !== null;
  const closeForm = () => {
    setAdding(false);
    onDraftDone(); // a form that came from a transcript line is closed by clearing that draft
  };

  async function run(request: Promise<unknown>, message?: string) {
    try {
      await request;
      reload();
      if (message) toast(message);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  }
  async function rename() {
    if (renaming && renaming.title.trim()) await run(api(`/api/soundbites/${renaming.id}`, send("PATCH", { title: renaming.title.trim() })));
    setRenaming(null);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2 style={{ padding: "14px 16px", fontSize: 14, fontWeight: 500 }}>Soundbites · {bites.length}</h2>
        <button className={styles.iconButton} onClick={() => setAdding(true)} aria-label="New soundbite"><Plus size={16} /></button>
      </div>

      {composing && <Composer key={draft?.id ?? "manual"} draft={draft} time={time} duration={duration} onCancel={closeForm} onSave={async (body) => {
        if (await run(api(`/api/meetings/${meetingId}/soundbites`, send("POST", body)), "Soundbite saved")) closeForm();
      }} />}

      <ul className={styles.list} aria-label="Soundbites">
        {bites.map((b) => (
          <li key={b.id} className={styles.item}>
            {renaming?.id === b.id ? (
              <input className="input" autoFocus value={renaming.title} onChange={(e) => setRenaming({ id: b.id, title: e.target.value })} onBlur={rename} onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" && setRenaming(null))} aria-label="Soundbite title" />
            ) : (
              <h3>{b.title}</h3>
            )}
            <div className={styles.range}>
              <button onClick={() => onSeek(b.start_sec)} title="Jump to the start">{clock(b.start_sec)}</button> – <span>{clock(b.end_sec)}</span>
              <button onClick={() => onPlay(b.start_sec, b.end_sec)} aria-label={`Play "${b.title}"`}><Play size={13} fill="currentColor" /></button>
            </div>
            {b.excerpt && <p className={styles.excerpt}>{b.excerpt}</p>}
            <div className={styles.actions}>
              <button className={styles.iconButton} onClick={() => setRenaming({ id: b.id, title: b.title })} aria-label={`Rename "${b.title}"`}><Pencil size={14} /></button>
              <button className={styles.iconButton} onClick={() => run(api(`/api/soundbites/${b.id}`, send("DELETE")))} aria-label={`Delete "${b.title}"`}><Trash2 size={14} /></button>
            </div>
          </li>
        ))}
        {bites.length === 0 && !composing && <li className={styles.empty}>No soundbites yet. Hover a transcript line and choose the scissors, or press +.</li>}
      </ul>
    </div>
  );
}

function Composer({ draft, time, duration, onCancel, onSave }: { draft: SoundbiteDraft | null; time: number; duration: number; onCancel: () => void; onSave: (b: { title: string; start_sec: number; end_sec: number }) => Promise<void> }) {
  const start0 = draft?.start ?? time;
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(clock(start0));
  const [end, setEnd] = useState(clock(draft?.end ?? Math.min(start0 + 15, duration)));
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = parseClock(start), t = parseClock(end);
    if (!title.trim()) return setError("Give the soundbite a title.");
    if (s === null || t === null) return setError("Times look like 1:23.");
    if (t <= s) return setError("The end must be after the start.");
    if (t > duration + 1) return setError(`The meeting is only ${clock(duration)} long.`);
    setError("");
    await onSave({ title: title.trim(), start_sec: s, end_sec: t });
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus aria-label="Title" maxLength={200} />
      <div className={styles.row}>
        <label style={{ flex: 1 }}>Start<input className="input" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" /></label>
        <label style={{ flex: 1 }}>End<input className="input" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time" /></label>
      </div>
      <div className={styles.row}>
        <button type="button" className="btn btn-ghost" onClick={() => setStart(clock(time))}>Start = now</button>
        <button type="button" className="btn btn-ghost" onClick={() => setEnd(clock(time))}>End = now</button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.row} style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary">Save</button>
      </div>
    </form>
  );
}
