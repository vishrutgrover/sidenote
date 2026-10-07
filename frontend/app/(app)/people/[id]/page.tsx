"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useToast } from "@/components/Toast";
import { api, send } from "@/lib/api";
import { avatarColor, clock, dateTimeLabel, initials, talkTime } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import type { PersonDetail } from "@/lib/types";
import { useTicks } from "@/lib/useTicks";
import styles from "../people.module.css";

/** One person: how much they talk, which meetings they were in, and what they still owe. */
export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: person, error, reload } = useFetch<PersonDetail>(`/api/people/${id}`);
  const { isDone, toggle } = useTicks(person?.open_tasks ?? []);

  if (error && !person) {
    return (
      <div className="empty" style={{ paddingTop: 120 }}>
        <strong>{error === "Person not found" ? "This person does not exist" : "Could not load this person"}</strong>
        <p>{error === "Person not found" ? "They may never have been in a meeting." : error}</p>
        <Link href="/people" className="btn">Back to people</Link>
      </div>
    );
  }
  if (!person) return <div className={styles.page}><div className="skeleton" style={{ height: 120 }} /></div>;

  async function save(taskId: number, done: boolean) {
    try {
      await api(`/api/action-items/${taskId}`, send("PATCH", { is_done: done }));
      reload();
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  }

  return (
    <div className={styles.page}>
      <Link href="/people" className={styles.back}><ChevronLeft size={16} /> People</Link>
      <header className={styles.header}>
        <span className="avatar" style={{ background: avatarColor(person.id), width: 56, height: 56, fontSize: 20 }}>{initials(person.name)}</span>
        <div>
          <h2>{person.name}{person.is_me && <span className="badge-green" style={{ marginLeft: 10 }}>You</span>}</h2>
          <span className="muted">{person.email}</span>
        </div>
      </header>

      <div className={styles.stats}>
        <div className="card"><strong>{person.meeting_count}</strong><span className="muted">Meetings</span></div>
        <div className="card"><strong>{talkTime(person.total_talk_sec)}</strong><span className="muted">Total talk time</span></div>
        <div className="card"><strong>{person.wpm}</strong><span className="muted">Words per minute</span></div>
      </div>

      <section aria-label="Meetings">
        <h3>Meetings</h3>
        {person.meetings.length === 0 && <p className="muted">Not in any meeting yet.</p>}
        <ul className={styles.list}>
          {person.meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/view/${m.id}`}>
                <span><strong>{m.title}</strong><span className="muted">{dateTimeLabel(m.started_at)}</span></span>
                <span className={styles.share} title={`${m.share_pct}% of the talking`}>
                  <span className={styles.bar}><span style={{ width: `${m.share_pct}%` }} /></span>
                  {talkTime(m.talk_sec)} · {m.share_pct}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Open tasks">
        <h3>Open tasks</h3>
        {person.open_tasks.length === 0 && <p className="muted">Nothing open. All caught up.</p>}
        <ul className={styles.list}>
          {person.open_tasks.map((t) => (
            <li key={t.id} className={styles.task}>
              <input type="checkbox" checked={isDone(t)} onChange={() => toggle(t, (done) => save(t.id, done))} aria-label={`Mark "${t.text}" ${isDone(t) ? "not done" : "done"}`} />
              <span className={isDone(t) ? styles.done : ""}>{t.text}</span>
              <Link href={`/view/${t.meeting_id}${t.timestamp_sec !== null ? `?t=${Math.floor(t.timestamp_sec)}` : ""}`} className="muted">{t.meeting_title}{t.timestamp_sec !== null && ` · ${clock(t.timestamp_sec)}`}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
