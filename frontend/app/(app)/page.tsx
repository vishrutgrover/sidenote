"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarClock, ChevronRight, ClipboardPaste, ListChecks, Monitor, NotebookText, Settings as SettingsIcon, Smartphone, Sparkles, Upload, Video } from "lucide-react";
import { AskPanel } from "@/components/AskPanel";
import { NewMeetingModal } from "@/components/NewMeetingModal";
import { useToast } from "@/components/Toast";
import { dayLabel, greeting, initials, timeLabel } from "@/lib/format";
import { useBrowserValue, useFetch } from "@/lib/hooks";
import type { ActionItem, Me, Meeting } from "@/lib/types";
import styles from "./home.module.css";

type Tab = "recent" | "upcoming" | "feed";

export default function Home() {
  const toast = useToast();
  const { data: me } = useFetch<Me>("/api/me");
  const { data: meetings = [] } = useFetch<Meeting[]>("/api/meetings?sort=recent");
  const { data: tasks = [] } = useFetch<ActionItem[]>("/api/action-items?mine=true&done=false");
  const [tab, setTab] = useState<Tab>("recent");
  const [modal, setModal] = useState<"file" | "text" | null>(null);

  const latest = meetings.find((m) => m.overview);
  const first = me?.name.split(" ")[0] ?? "";
  const hello = useBrowserValue(greeting, "Hello"); // the server cannot know the visitor's time of day

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <header className={styles.hero}>
          <h2>{hello}{first && `, ${first}`}</h2>
        </header>

        <section aria-label="Personal assistant">
          <h2 className={styles.label}><Sparkles size={15} /> Personal Assistant</h2>
          <div className={styles.cards}>
            <Link href={latest ? `/view/${latest.id}` : "/meetings"} className={`card ${styles.tile}`}>
              <span className={styles.icon} style={{ background: "linear-gradient(135deg,#8b9cff,#6c5ce7)" }}><NotebookText size={18} /></span>
              <strong>Daily Brief</strong>
              <span className="muted">{latest ? latest.overview.slice(0, 70) + (latest.overview.length > 70 ? "…" : "") : "No brief yet"}</span>
            </Link>
            <button className={`card ${styles.tile}`} onClick={() => toast("Meeting Prep is coming soon")}>
              <span className={styles.icon} style={{ background: "linear-gradient(135deg,#ff9a8b,#ff6a88)" }}><CalendarClock size={18} /></span>
              <strong>Meeting Prep</strong>
              <span className="muted">No upcoming meetings</span>
            </button>
            <Link href="/tasks" className={`card ${styles.tile}`}>
              <span className={styles.icon} style={{ background: "linear-gradient(135deg,#a8e063,#56ab2f)" }}><ListChecks size={18} /></span>
              <strong>Tasks</strong>
              <span className="muted">{tasks.length === 0 ? "All caught up" : `${tasks.length} open for you`}</span>
            </Link>
          </div>
        </section>

        <section aria-label="Quick start">
          <h2 className={styles.section}>Quick Start</h2>
          <p className="muted">Add a transcript to see Sidenote in action.</p>
          <div className={styles.quick}>
            <button onClick={() => setModal("file")}><Upload size={18} /> Upload File <ChevronRight size={16} /></button>
            <button onClick={() => setModal("text")}><ClipboardPaste size={18} /> Paste Transcript <ChevronRight size={16} /></button>
            <button onClick={() => toast("Capturing live meetings is coming soon")}><Video size={18} /> Capture Meeting <ChevronRight size={16} /></button>
          </div>
        </section>

        <section aria-label="Meetings">
          <div className={styles.tabsRow}>
            <div className={styles.tabs} role="tablist">
              {([["recent", "Recent"], ["upcoming", "Upcoming"], ["feed", "AI Feed"]] as const).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? styles.on : ""} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            <Link href="/settings" className={styles.settings}><SettingsIcon size={14} /> Settings</Link>
          </div>

          {tab === "recent" && (
            <ul className={styles.recent}>
              {meetings.slice(0, 5).map((m) => {
                const host = m.participants.find((p) => p.is_host) ?? m.participants[0];
                return (
                  <li key={m.id}>
                    <Link href={`/view/${m.id}`}>
                      <span className="avatar" style={{ background: host?.color ?? "var(--primary)" }}>{initials(host?.name ?? "")}</span>
                      <span><strong>{m.title}</strong><span className="muted">{dayLabel(m.started_at)} · {timeLabel(m.started_at)}</span></span>
                    </Link>
                  </li>
                );
              })}
              <li className={styles.caught}><span className="chip">All caught up!</span></li>
            </ul>
          )}
          {tab === "upcoming" && <div className="empty"><strong>No upcoming meetings</strong><p>Calendar connections are coming soon.</p></div>}
          {tab === "feed" && <div className="empty"><strong>Your AI feed is coming soon</strong><p>Highlights and nudges from across your meetings will appear here.</p></div>}
        </section>

        <section aria-label="Try more">
          <h2 className={styles.section}>Try More</h2>
          <div className={styles.more}>
            <div className={`card ${styles.big}`}><Monitor size={22} color="var(--primary)" /><strong>Desktop App</strong><p className="muted">Capture conversations without any bot present in your meeting.</p><span className="chip">Coming soon</span></div>
            <div className={`card ${styles.big}`}><Smartphone size={22} color="#e84393" /><strong>Mobile App</strong><p className="muted">Record in-person conversations and review meetings on the go.</p><span className="chip">Coming soon</span></div>
          </div>
        </section>
      </div>

      <aside className={styles.ask} aria-label="Ask Sidenote">
        <h2><Sparkles size={15} /> Ask Sidenote</h2>
        <AskPanel meetingId={null} greeting={first ? `Hi ${first}! Get ready for your meeting` : undefined} />
      </aside>

      <NewMeetingModal open={modal !== null} start={modal ?? "file"} onClose={() => setModal(null)} />
    </div>
  );
}
