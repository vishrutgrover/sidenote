"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Search, Sparkles } from "lucide-react";
import { NotesPanel } from "@/components/NotesPanel";
import { PlayerBar } from "@/components/PlayerBar";
import { SmartSearch } from "@/components/SmartSearch";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { apiUrl } from "@/lib/api";
import { dateTimeLabel, duration, initials } from "@/lib/format";
import { useFetch, useHotkey } from "@/lib/hooks";
import type { ActionItem, Insights, Meeting, Segment } from "@/lib/types";
import { usePlayer } from "@/lib/usePlayer";
import styles from "./view.module.css";

/** True when a key press is meant for a form control, so page shortcuts must stay out of the way. */
const typingIn = (e: KeyboardEvent) => e.target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName) || e.target.isContentEditable);

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const { data: meeting, error, reload } = useFetch<Meeting>(`/api/meetings/${id}`);
  const { data: lines = [], loading: linesLoading, error: linesError } = useFetch<Segment[]>(`/api/meetings/${id}/transcript`);
  const { data: items = [], reload: reloadItems } = useFetch<ActionItem[]>(`/api/meetings/${id}/action-items`);
  const { data: insights, reload: reloadInsights } = useFetch<Insights>(`/api/meetings/${id}/insights`);
  const itemsChanged = () => {
    reloadItems();
    reloadInsights();
  };
  const [panel, setPanel] = useState<"search" | null>("search");
  const player = usePlayer(meeting?.duration_sec ?? 0, meeting?.media_url ? apiUrl(meeting.media_url) : null);

  // a freshly uploaded meeting is still being processed: check again until it is ready
  useEffect(() => {
    if (meeting?.status !== "processing") return;
    const timer = setInterval(reload, 2000);
    return () => clearInterval(timer);
  }, [meeting?.status, reload]);

  useHotkey((e) => e.code === "Space" && !e.metaKey && !e.ctrlKey && !typingIn(e), player.toggle);
  useHotkey((e) => e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey && !typingIn(e), () => player.skip(-5));
  useHotkey((e) => e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey && !typingIn(e), () => player.skip(5));

  if (error && !meeting) {
    return (
      <div className="empty" style={{ paddingTop: 160 }}>
        <strong>{error === "Meeting not found" ? "This meeting does not exist" : "Could not load this meeting"}</strong>
        <p>{error === "Meeting not found" ? "It may have been deleted." : error}</p>
        <Link href="/meetings" className="btn">Back to meetings</Link>
      </div>
    );
  }

  const host = meeting?.participants.find((p) => p.is_host) ?? meeting?.participants[0];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/meetings" className="btn btn-ghost btn-icon" aria-label="Back to meetings"><ChevronLeft size={18} /></Link>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/meetings">#All Meetings</Link>
          <span>/</span>
          <span>{meeting?.title ?? "…"}</span>
        </nav>
      </header>

      <div className={`${styles.body} ${panel ? styles.withPanel : ""}`}>
        <nav className={styles.rail} aria-label="Meeting tools">
          <button className={panel === "search" ? styles.railOn : ""} onClick={() => setPanel(panel === "search" ? null : "search")} aria-label="Smart Search" aria-pressed={panel === "search"} title="Smart Search">
            <Search size={18} />
          </button>
        </nav>
        {panel === "search" && meeting && (
          <aside className={styles.left} aria-label="Smart Search">
            <h2>Smart Search</h2>
            <SmartSearch meeting={meeting} lines={lines} insights={insights} tasks={items} onSeek={(t) => player.seek(t)} onTagsChanged={reload} />
          </aside>
        )}
        <section className={styles.center}>
          {!meeting ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (
            <>
              <h1 className={styles.title}>{meeting.title}</h1>
              <div className={`${styles.meta} muted`}>
                {host && <span className="avatar" style={{ background: host.color, width: 22, height: 22, fontSize: 10 }}>{initials(host.name)}</span>}
                {host?.name} · {dateTimeLabel(meeting.started_at)} · {duration(meeting.duration_sec)}
              </div>
              <div className={styles.people}>
                {meeting.participants.map((p) => <span key={p.id} className="chip">{p.name}</span>)}
              </div>

              {meeting.status === "processing" ? (
                <div className={`empty ${styles.processing}`}>
                  <Sparkles color="var(--primary)" />
                  <strong>Meeting summary is processing…</strong>
                  <p>It may take a few moments to analyse the transcript.</p>
                </div>
              ) : meeting.status === "failed" ? (
                <div className={`empty ${styles.processing}`}>
                  <strong>The notes could not be generated</strong>
                  <p>The transcript is still available on the right.</p>
                </div>
              ) : (
                <NotesPanel meeting={meeting} items={items} onItemsChanged={itemsChanged} onSeek={(t) => { player.seek(t); }} />
              )}
            </>
          )}
        </section>

        <aside className={styles.right} aria-label="Transcript">
          <div className={styles.tabs}><span className={styles.tab}>Transcript</span></div>
          {meeting && <TranscriptPanel meetingId={meeting.id} lines={lines} loading={linesLoading} error={linesError} player={player} />}
        </aside>
      </div>

      <PlayerBar player={player} />
    </div>
  );
}
