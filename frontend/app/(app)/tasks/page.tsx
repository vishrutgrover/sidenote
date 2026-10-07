"use client";
import Link from "next/link";
import { useState } from "react";
import { ListChecks } from "lucide-react";
import { useToast } from "@/components/Toast";
import { api, query, send } from "@/lib/api";
import { clock } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { openCount } from "@/lib/notes";
import type { ActionItem } from "@/lib/types";
import { useTicks } from "@/lib/useTicks";
import styles from "./tasks.module.css";

type Show = "open" | "all" | "done";

/** Meetings in the order they first appear, each with its tasks. */
function byMeeting(items: ActionItem[]): [number, string, ActionItem[]][] {
  const groups = new Map<number, [string, ActionItem[]]>();
  for (const i of items) groups.set(i.meeting_id, [i.meeting_title, [...(groups.get(i.meeting_id)?.[1] ?? []), i]]);
  return [...groups].map(([id, [title, list]]) => [id, title, list]);
}

export default function TasksPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [show, setShow] = useState<Show>("open");
  const path = "/api/action-items" + query({ mine: tab === "mine" ? true : undefined, done: show === "open" ? false : show === "done" ? true : undefined });
  const { data: items = [], error, loading, reload } = useFetch<ActionItem[]>(path);
  const { isDone, toggle } = useTicks(items);

  async function save(item: ActionItem, done: boolean) {
    try {
      await api(`/api/action-items/${item.id}`, send("PATCH", { is_done: done }));
      reload();
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist">
          {(["mine", "all"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? styles.on : ""} onClick={() => setTab(t)}>{t === "mine" ? "My Tasks" : "All Tasks"}</button>
          ))}
        </div>
        <div className={styles.tabs} role="radiogroup" aria-label="Show">
          {(["open", "all", "done"] as const).map((s) => (
            <button key={s} role="radio" aria-checked={show === s} className={show === s ? styles.on : ""} onClick={() => setShow(s)}>{s === "open" ? "Open" : s === "all" ? "All" : "Done"}</button>
          ))}
        </div>
      </div>

      {error && !items.length && <div className="empty"><strong>Could not load tasks</strong><p>{error}</p><button className="btn" onClick={reload}>Try again</button></div>}
      {!error && !loading && items.length === 0 && (
        <div className="empty">
          <ListChecks size={32} color="var(--faint)" />
          <strong>{show === "done" ? "Nothing finished yet" : tab === "mine" ? "No tasks for you" : "All your meeting tasks in one place"}</strong>
          <p>{tab === "mine" ? "Tasks assigned to you in a meeting show up here." : "Tasks from every meeting show up here."}</p>
        </div>
      )}

      <div style={{ opacity: loading && items.length ? 0.55 : 1 }}>
        {items.length > 0 && <p className={`muted ${styles.count}`}>{openCount(items.map((i) => ({ ...i, is_done: isDone(i) })))} open of {items.length}</p>}
        {byMeeting(items).map(([id, title, list]) => (
          <section key={id} className={styles.group}>
            <h2><Link href={`/view/${id}`}>{title}</Link></h2>
            <ul>
              {list.map((i) => (
                <li key={i.id} className={`${styles.row} ${isDone(i) ? styles.done : ""}`}>
                  <input type="checkbox" checked={isDone(i)} onChange={() => toggle(i, (done) => save(i, done))} aria-label={`Mark "${i.text}" ${isDone(i) ? "not done" : "done"}`} />
                  <span className={styles.text}>{i.text}</span>
                  {i.assignee && <span className="chip">{i.assignee.name}</span>}
                  {i.timestamp_sec !== null && <Link href={`/view/${id}?t=${Math.floor(i.timestamp_sec)}`} className={styles.stamp} title="Open at this moment">{clock(i.timestamp_sec)}</Link>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
