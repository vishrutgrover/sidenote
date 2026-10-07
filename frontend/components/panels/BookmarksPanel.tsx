"use client";
import { useState } from "react";
import { Bookmark as BookmarkIcon, Trash2 } from "lucide-react";
import { api, send } from "@/lib/api";
import { clock } from "@/lib/format";
import type { Bookmark } from "@/lib/types";
import { useToast } from "../Toast";
import styles from "../panels.module.css";

type Props = { meetingId: number; bookmarks: Bookmark[]; time: number; onSeek: (sec: number) => void; onChanged: () => void };

/** Moments worth coming back to. The star in the player bar adds one too. */
export function BookmarksPanel({ meetingId, bookmarks, time, onSeek, onChanged }: Props) {
  const toast = useToast();
  const [note, setNote] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/meetings/${meetingId}/bookmarks`, send("POST", { time_sec: time, note: note.trim() }));
      setNote("");
      onChanged();
      toast(`Bookmarked ${clock(time)}`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }
  async function remove(id: number) {
    try {
      await api(`/api/bookmarks/${id}`, send("DELETE"));
      onChanged();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className={styles.panel}>
      <h2 style={{ padding: "14px 16px", fontSize: 14, fontWeight: 500 }}>Bookmarks · {bookmarks.length}</h2>
      <ul className={styles.list} aria-label="Bookmarks">
        {bookmarks.map((b) => (
          <li key={b.id} className={styles.item}>
            <button className={styles.link} onClick={() => onSeek(b.time_sec)} title="Jump to this moment">{clock(b.time_sec)}</button>
            {b.note && <p>{b.note}</p>}
            <div className={styles.actions}>
              <button className={styles.iconButton} onClick={() => remove(b.id)} aria-label={`Delete bookmark at ${clock(b.time_sec)}`}><Trash2 size={14} /></button>
            </div>
          </li>
        ))}
        {bookmarks.length === 0 && <li className={styles.empty}>No bookmarks yet. Press the star in the player to save a moment.</li>}
      </ul>
      <form className={styles.composer} onSubmit={add}>
        <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Bookmark note" maxLength={300} />
        <button className="btn btn-primary"><BookmarkIcon size={14} /> Bookmark {clock(time)}</button>
      </form>
    </div>
  );
}
