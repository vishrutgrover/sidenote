"use client";
import { useState } from "react";
import { Send, Trash2, X } from "lucide-react";
import { api, send } from "@/lib/api";
import { clock, dateTimeLabel } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { activeIndex } from "@/lib/transcript";
import type { Comment, Segment } from "@/lib/types";
import { useToast } from "../Toast";
import styles from "../panels.module.css";

type Props = { meetingId: number; lines: Segment[]; time: number; target: number | null; onTargetChange: (id: number | null) => void; onSeek: (sec: number) => void; onChanged: () => void };

/** Notes on individual transcript lines. A comment is attached to the line chosen in the transcript, or the one playing now. */
export function CommentsPanel({ meetingId, lines, time, target, onTargetChange, onSeek, onChanged }: Props) {
  const toast = useToast();
  const { data: comments = [], reload } = useFetch<Comment[]>(`/api/meetings/${meetingId}/comments`);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const targetLine = lines.find((l) => l.id === target) ?? lines[activeIndex(lines, time)] ?? lines[0];

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !targetLine) return;
    setBusy(true);
    try {
      await api(`/api/meetings/${meetingId}/comments`, send("POST", { segment_id: targetLine.id, body: body.trim() }));
      setBody("");
      onTargetChange(null);
      reload();
      onChanged(); // the transcript shows a comment count per line
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    try {
      await api(`/api/comments/${id}`, send("DELETE"));
      reload();
      onChanged();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className={styles.panel}>
      <h2 style={{ padding: "14px 16px", fontSize: 14, fontWeight: 500 }}>Comments · {comments.length}</h2>
      <ul className={styles.list} aria-label="Comments">
        {comments.map((c) => (
          <li key={c.id} className={styles.item}>
            <button className={styles.quote} onClick={() => onSeek(c.start_sec)} title="Jump to this line">
              <span className={styles.link}>{clock(c.start_sec)}</span> {c.quote.length > 90 ? c.quote.slice(0, 89) + "…" : c.quote}
            </button>
            <div className={styles.who}><strong>{c.author}</strong> {dateTimeLabel(c.created_at)}</div>
            <p>{c.body}</p>
            <div className={styles.actions}>
              <button className={styles.iconButton} onClick={() => remove(c.id)} aria-label="Delete comment"><Trash2 size={14} /></button>
            </div>
          </li>
        ))}
        {comments.length === 0 && <li className={styles.empty}>No comments yet. Start a discussion about a moment in the meeting.</li>}
      </ul>

      <form className={styles.composer} onSubmit={post}>
        {targetLine && (
          <div className={styles.quote} style={{ display: "flex", justifyContent: "space-between", gap: 8 }} aria-label="Commenting on">
            <span>On <strong>{clock(targetLine.start_sec)}</strong> {targetLine.text.length > 60 ? targetLine.text.slice(0, 59) + "…" : targetLine.text}</span>
            {target !== null && <button type="button" className={styles.iconButton} onClick={() => onTargetChange(null)} aria-label="Use the line playing now"><X size={12} /></button>}
          </div>
        )}
        <textarea
          className="input"
          rows={2}
          placeholder="Comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), (e.currentTarget.form as HTMLFormElement).requestSubmit())}
          aria-label="Comment"
          maxLength={2000}
        />
        <button className="btn btn-primary" disabled={!body.trim() || busy}><Send size={14} /> Comment</button>
      </form>
    </div>
  );
}
