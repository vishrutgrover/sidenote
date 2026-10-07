"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Bell, CheckCircle2, ListChecks, Loader2 } from "lucide-react";
import { dateTimeLabel } from "@/lib/format";
import { useDismiss, useFetch, useLocalStorage } from "@/lib/hooks";
import type { ActionItem, Meeting } from "@/lib/types";
import styles from "./NotificationsMenu.module.css";

/** The bell. There is no notification service: it lists what changed in your meetings. */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);
  const { data: meetings = [] } = useFetch<Meeting[]>("/api/meetings?sort=recent");
  const { data: tasks = [] } = useFetch<ActionItem[]>("/api/action-items?mine=true&done=false");
  const [seen, setSeen] = useLocalStorage<string>("notificationsSeen", "");

  const recent = meetings.slice(0, 5);
  const newest = recent[0]?.started_at ?? "";
  const unread = newest !== "" && newest > seen; // ISO times compare as text
  const toggle = () => {
    if (!open && newest) setSeen(newest); // opening the bell marks everything as seen
    setOpen(!open);
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label={unread ? "Notifications, new" : "Notifications"} aria-expanded={open} aria-haspopup="dialog">
        <Bell size={18} />
        {unread && <span className={styles.dot} />}
      </button>
      {open && (
        <div className={styles.menu} role="dialog" aria-label="Notifications">
          <h2>Notifications</h2>
          {tasks.length > 0 && (
            <Link href="/tasks" className={styles.item} onClick={() => setOpen(false)}>
              <ListChecks size={18} />
              <div><strong>{tasks.length} open task{tasks.length > 1 ? "s" : ""} for you</strong><span>Review what you owe from your meetings.</span></div>
            </Link>
          )}
          {recent.map((m) => (
            <Link key={m.id} href={`/view/${m.id}`} className={styles.item} onClick={() => setOpen(false)}>
              {m.status === "processing" ? <Loader2 size={18} /> : <CheckCircle2 size={18} />}
              <div>
                <strong>“{m.title}” {m.status === "processing" ? "is being processed" : m.status === "failed" ? "could not be processed" : "is ready"}</strong>
                <span>{dateTimeLabel(m.started_at)}{m.status === "ready" && " · Review your notes"}</span>
              </div>
            </Link>
          ))}
          {recent.length === 0 && tasks.length === 0 && <p className={styles.empty}>You&apos;re all caught up.</p>}
        </div>
      )}
    </div>
  );
}
