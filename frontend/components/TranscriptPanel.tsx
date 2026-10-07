"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ChevronDown, ChevronUp, MessageSquare, Scissors, Search, X } from "lucide-react";
import { clock } from "@/lib/format";
import { useDebounced, useFetch } from "@/lib/hooks";
import { activeIndex, highlightPieces, startsNewSpeaker } from "@/lib/transcript";
import type { Segment } from "@/lib/types";
import type { Player } from "@/lib/usePlayer";
import styles from "./TranscriptPanel.module.css";

/** The transcript with a find bar. Click a line to jump there; the line being spoken follows playback. */
type Props = { meetingId: number; lines: Segment[]; loading: boolean; error?: string; player: Player; onComment?: (segmentId: number) => void; onSoundbite?: (start: number, end: number) => void };

export function TranscriptPanel({ meetingId, lines, loading, error, player, onComment, onSoundbite }: Props) {
  const base = `/api/meetings/${meetingId}/transcript`;

  const [find, setFind] = useState("");
  const typed = useDebounced(find.trim(), 250);
  const q = find.trim() ? typed : ""; // clearing the box takes effect at once; only typing waits
  const { data: found } = useFetch<Segment[]>(q ? `${base}?q=${encodeURIComponent(q)}` : null);
  const matches = useMemo(() => (q && found ? lines.filter((l) => found.some((f) => f.id === l.id && f.match)) : []), [q, found, lines]);

  const hitIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);
  const [cursor, setCursor] = useState({ for: "", index: 0 });
  const index = cursor.for === q ? cursor.index : 0; // a new search starts at its first match
  const current = matches.length ? matches[Math.min(index, matches.length - 1)] : undefined;
  const step = (d: number) => matches.length && setCursor({ for: q, index: (index + d + matches.length) % matches.length });

  const active = activeIndex(lines, player.time);
  const [follow, setFollow] = useState(true);
  const els = useRef(new Map<number, HTMLElement>());
  const show = (id: number | undefined) => id !== undefined && els.current.get(id)?.scrollIntoView?.({ block: "center", behavior: "smooth" });

  const activeId = lines[active]?.id;
  useEffect(() => {
    if (follow && !q && player.playing) show(activeId);
  }, [activeId, follow, q, player.playing]);

  const currentId = current?.id;
  useEffect(() => {
    show(currentId);
  }, [currentId]);

  if (error && !lines.length) return <p className="empty">{error}</p>;
  if (loading && !lines.length) return <div className={styles.panel}>{[0, 1, 2, 3].map((i) => <div key={i} className={`skeleton ${styles.skeleton}`} />)}</div>;

  return (
    <div className={styles.panel}>
      <div className={styles.find}>
        <Search size={15} />
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? step(e.shiftKey ? -1 : 1) : e.key === "Escape" && setFind(""))}
          placeholder="Find in transcript"
          aria-label="Find in transcript"
        />
        {q && (
          <>
            <span className={styles.count} aria-live="polite">{matches.length ? `${Math.min(index, matches.length - 1) + 1} of ${matches.length}` : found ? "No matches" : ""}</span>
            <button onClick={() => step(-1)} disabled={!matches.length} aria-label="Previous match"><ChevronUp size={16} /></button>
            <button onClick={() => step(1)} disabled={!matches.length} aria-label="Next match"><ChevronDown size={16} /></button>
            <button onClick={() => setFind("")} aria-label="Clear find"><X size={16} /></button>
          </>
        )}
      </div>

      <div className={styles.lines} onWheel={() => setFollow(false)} onTouchMove={() => setFollow(false)}>
        {lines.map((l, i) => (
          <div
            key={l.id}
            ref={(el) => void (el ? els.current.set(l.id, el) : els.current.delete(l.id))}
            className={`${styles.line} ${i === active ? styles.active : ""} ${current?.id === l.id ? styles.currentMatch : ""}`}
            aria-current={i === active ? "true" : undefined}
            data-line={l.id}
          >
            {startsNewSpeaker(lines, i) && (
              <div className={styles.who}>
                <span className="avatar" style={{ background: l.speaker?.color ?? "#999" }}>{(l.speaker?.name ?? "?")[0]}</span>
                <strong>{l.speaker?.name ?? "Unknown"}</strong>
              </div>
            )}
            <button className={styles.text} onClick={() => { player.seek(l.start_sec); setFollow(true); }} title={`Jump to ${clock(l.start_sec)}`}>
              <span className={styles.stamp}>{clock(l.start_sec)}</span>
              {highlightPieces(l.text, hitIds.has(l.id) ? q : "").map((p, k) => (p.hit ? <mark key={k}>{p.text}</mark> : p.text))}
            </button>
            <div className={styles.lineActions}>
              {l.comment_count > 0 && onComment && (
                <button className={styles.badge} onClick={() => onComment(l.id)} aria-label={`${l.comment_count} comment${l.comment_count > 1 ? "s" : ""}, open`}>
                  <MessageSquare size={12} /> {l.comment_count}
                </button>
              )}
              {onComment && <button onClick={() => onComment(l.id)} aria-label={`Comment on ${clock(l.start_sec)}`} title="Comment on this line"><MessageSquare size={14} /></button>}
              {onSoundbite && <button onClick={() => onSoundbite(l.start_sec, l.end_sec)} aria-label={`Make a soundbite from ${clock(l.start_sec)}`} title="Make a soundbite from this line"><Scissors size={14} /></button>}
            </div>
          </div>
        ))}
      </div>

      {!follow && player.playing && !q && (
        <button className={`btn btn-primary ${styles.jump}`} onClick={() => setFollow(true)}>
          <ArrowDownToLine size={14} /> Jump to current
        </button>
      )}
    </div>
  );
}
