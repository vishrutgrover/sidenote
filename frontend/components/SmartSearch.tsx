"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { api, send } from "@/lib/api";
import { clock } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { ringDash } from "@/lib/notes";
import type { ActionItem, Insights, Meeting, Segment, Topic } from "@/lib/types";
import { useToast } from "./Toast";
import styles from "./SmartSearch.module.css";

type FilterKey = "questions" | "tasks" | "dates_times" | "metrics";
const FILTERS: { key: FilterKey; label: string; color: string }[] = [
  { key: "questions", label: "Questions", color: "#e84393" },
  { key: "tasks", label: "Tasks", color: "#e17055" },
  { key: "dates_times", label: "Date & Time", color: "#00b894" },
  { key: "metrics", label: "Metrics", color: "#0984e3" },
];
const SENTIMENTS = [
  { key: "positive", label: "Positive", color: "#4fc3f7" },
  { key: "neutral", label: "Neutral", color: "#f48fb1" },
  { key: "negative", label: "Negative", color: "#ffb74d" },
] as const;

type Props = { meeting: Meeting; lines: Segment[]; insights?: Insights; tasks: ActionItem[]; onSeek: (sec: number) => void; onTagsChanged: () => void };

/** The numbers behind a meeting: what kinds of lines it has, mood, who talked, and its tags. */
export function SmartSearch({ meeting, lines, insights, tasks, onSeek, onTagsChanged }: Props) {
  const toast = useToast();
  const { data: allTopics = [] } = useFetch<Topic[]>("/api/topics");
  const [open, setOpen] = useState<FilterKey | null>(null);
  const [adding, setAdding] = useState(false);
  const [tag, setTag] = useState("");

  async function change(request: Promise<unknown>) {
    try {
      await request;
      onTagsChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
  const addTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tag.trim()) return;
    await change(api(`/api/meetings/${meeting.id}/topics/${encodeURIComponent(tag.trim())}`, send("PUT")));
    setTag("");
    setAdding(false);
  };

  if (!insights) return <div className="skeleton" style={{ height: 300, margin: 16 }} />;

  // what the opened filter lists: transcript lines, or action items for "tasks"
  const listed = open === "tasks"
    ? tasks.map((t) => ({ key: `t${t.id}`, at: t.timestamp_sec, text: t.text }))
    : open ? insights.filters[open].map((id) => lines.find((l) => l.id === id)).filter((l): l is Segment => !!l).map((l) => ({ key: `l${l.id}`, at: l.start_sec, text: l.text })) : [];

  return (
    <div className={styles.panel}>
      <details open>
        <summary>AI filters</summary>
        <div className={styles.filters}>
          {FILTERS.map(({ key, label, color }) => {
            const count = key === "tasks" ? tasks.length : insights.filters[key].length;
            return (
              <button key={key} className={`${styles.filter} ${open === key ? styles.on : ""}`} onClick={() => setOpen(open === key ? null : key)} disabled={count === 0} aria-pressed={open === key}>
                <i style={{ background: color }} /> {label} <span>{count}</span>
              </button>
            );
          })}
        </div>
        {open && (
          <ul className={styles.listed} aria-label={`${FILTERS.find((f) => f.key === open)?.label} in this meeting`}>
            {listed.map((item) => (
              <li key={item.key}>
                <button onClick={() => item.at !== null && onSeek(item.at)}>
                  {item.at !== null && <span>{clock(item.at)}</span>} {item.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details open>
        <summary>Sentiments</summary>
        {SENTIMENTS.map(({ key, label, color }) => (
          <div key={key} className={styles.row}>
            <span><i style={{ background: color }} /> {label}</span>
            <strong>{insights.sentiments[key].pct}%</strong>
          </div>
        ))}
      </details>

      <details open>
        <summary>Speaker talktime</summary>
        <div className={styles.speakers}>
          <div className={styles.head}><span>Speakers</span><span>WPM</span><span>Talktime</span></div>
          {insights.speakers.map((s) => (
            <div key={s.participant_id ?? s.name} className={styles.speaker}>
              <span className={styles.name}><b className="avatar" style={{ background: s.color }}>{s.name[0]}</b>{s.name}</span>
              <span className="muted">{s.wpm}</span>
              <span className={styles.ring}>
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="9" fill="none" stroke="var(--border)" strokeWidth="3" />
                  <circle cx="12" cy="12" r="9" fill="none" stroke="var(--primary)" strokeWidth="3" strokeDasharray={ringDash(s.share_pct)} transform="rotate(-90 12 12)" />
                </svg>
                {s.share_pct}%
              </span>
            </div>
          ))}
        </div>
      </details>

      <details open>
        <summary>Tags</summary>
        <div className={styles.tags}>
          {meeting.topics.map((t) => (
            <span key={t} className="chip">
              {t}
              <button onClick={() => change(api(`/api/meetings/${meeting.id}/topics/${encodeURIComponent(t)}`, send("DELETE")))} aria-label={`Remove tag ${t}`}><X size={12} /></button>
            </span>
          ))}
          {adding ? (
            <form onSubmit={addTag} className={styles.addTag}>
              <input className="input" list="all-tags" autoFocus value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} placeholder="New tag" aria-label="New tag" maxLength={50} />
              <datalist id="all-tags">{allTopics.filter((t) => !meeting.topics.includes(t.name)).map((t) => <option key={t.name} value={t.name} />)}</datalist>
            </form>
          ) : (
            <button className="chip" onClick={() => setAdding(true)} aria-label="Add tag"><Plus size={12} /> Add</button>
          )}
        </div>
        {meeting.topics.length === 0 && !adding && <p className="muted" style={{ marginTop: 8 }}>No tags yet. Tags let you find this meeting from the library.</p>}
      </details>
    </div>
  );
}
