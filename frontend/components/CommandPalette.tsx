"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bot, Search } from "lucide-react";
import { query } from "@/lib/api";
import { clock, dayLabel, timeLabel } from "@/lib/format";
import { useDebounced, useFetch } from "@/lib/hooks";
import { highlightPieces } from "@/lib/transcript";
import type { SearchResult } from "@/lib/types";
import { Modal } from "./Modal";
import styles from "./CommandPalette.module.css";

const marked = (text: string, q: string) => highlightPieces(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text));

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Search meetings" palette>
      <Palette onClose={onClose} />
    </Modal>
  );
}

// inside the modal, so the search box starts empty every time it opens
function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [titleOnly, setTitleOnly] = useState(false);
  const [sort, setSort] = useState("recent");
  const q = useDebounced(text.trim(), 250);
  const active = text.trim() ? q : ""; // clearing the box takes effect at once

  const { data, error, loading } = useFetch<SearchResult[]>(active ? "/api/search" + query({ q: active, title_only: titleOnly, sort }) : null);
  const results = useMemo(() => (active ? data ?? [] : []), [active, data]);

  // every row you can open, in the order they are shown, for the arrow keys
  const rows = useMemo(() => results.flatMap((r) => [`/view/${r.meeting.id}`, ...r.hits.map((h) => `/view/${r.meeting.id}?t=${Math.floor(h.start_sec)}`)]), [results]);
  const [cursor, setCursor] = useState({ key: "", index: 0 });
  const key = `${active}|${titleOnly}|${sort}`;
  const index = cursor.key === key ? Math.min(cursor.index, Math.max(rows.length - 1, 0)) : 0; // new results start at the top
  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length) setCursor({ key, index: (index + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length });
    } else if (e.key === "Enter" && rows[index]) {
      e.preventDefault();
      go(rows[index]);
    }
  }

  let row = -1; // position of the next row, to know which one is selected
  const rowProps = (href: string) => {
    row++;
    const mine = row;
    return { href, "aria-selected": mine === index, "data-selected": mine === index || undefined, onClick: onClose, ref: (el: HTMLAnchorElement | null) => { if (mine === index) el?.scrollIntoView?.({ block: "nearest" }); } };
  };

  return (
    <div onKeyDown={onKeyDown}>
      <div className={styles.input}>
        <Search size={18} />
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by title, person or anything said…" aria-label="Search" role="combobox" aria-expanded={rows.length > 0} aria-controls="search-results" />
        {text && <button onClick={() => setText("")} className={styles.clear}>Clear</button>}
      </div>

      <div className={styles.controls}>
        <label><input type="checkbox" checked={titleOnly} onChange={(e) => setTitleOnly(e.target.checked)} /> Title only</label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort results">
          <option value="recent">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      <div className={styles.body} id="search-results" role="listbox" aria-busy={loading}>
        <Link href="/ask" className={styles.ask} onClick={onClose}>
          <Bot size={18} /> <span>Ask Sidenote anything about your meetings</span> <strong>Try Ask Sidenote</strong>
        </Link>

        {!active && <p className={styles.hint}>Search titles, people and every word said in your meetings.</p>}
        {error && <p className={styles.hint} role="alert">{error}</p>}
        {active && data && results.length === 0 && (
          <div className="empty" style={{ padding: "40px 16px" }}>
            <strong>No results for &ldquo;{active}&rdquo;</strong>
            <p>Try a different keyword or check the spelling.</p>
          </div>
        )}

        {results.map((r) => (
          <section key={r.meeting.id} className={styles.result} style={{ opacity: loading ? 0.6 : 1 }}>
            <Link {...rowProps(`/view/${r.meeting.id}`)} className={styles.title} role="option">
              <strong>{marked(r.meeting.title, active)}</strong>
              <span className="muted">{dayLabel(r.meeting.started_at)} · {timeLabel(r.meeting.started_at)}{r.meeting.participants[0] && ` · ${r.meeting.participants.map((p) => p.name).join(", ")}`}</span>
            </Link>
            {r.hits.map((h) => (
              <Link key={h.id} {...rowProps(`/view/${r.meeting.id}?t=${Math.floor(h.start_sec)}`)} className={styles.hit} role="option">
                <span className={styles.stamp}>{clock(h.start_sec)}</span>
                <span><b>{h.speaker?.name ?? "Unknown"}</b> {marked(h.text, active)}</span>
              </Link>
            ))}
            {r.hit_count > r.hits.length && <p className={styles.more}>+{r.hit_count - r.hits.length} more in this meeting</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
