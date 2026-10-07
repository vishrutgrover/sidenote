"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Bookmark as BookmarkIcon, ChevronLeft, Download, MessageSquare, Search, Sparkles, Star } from "lucide-react";
import { ExportModal } from "@/components/ExportModal";
import { MeetingMenu } from "@/components/MeetingMenu";
import { NotesPanel } from "@/components/NotesPanel";
import { PlayerBar } from "@/components/PlayerBar";
import { BookmarksPanel } from "@/components/panels/BookmarksPanel";
import { CommentsPanel } from "@/components/panels/CommentsPanel";
import { SoundbitesPanel, type SoundbiteDraft } from "@/components/panels/SoundbitesPanel";
import { SmartSearch } from "@/components/SmartSearch";
import { useToast } from "@/components/Toast";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { api, apiUrl, send } from "@/lib/api";
import { clock, dateTimeLabel, duration, initials } from "@/lib/format";
import { useFetch, useHotkey } from "@/lib/hooks";
import type { ActionItem, Bookmark, Insights, Meeting, Segment } from "@/lib/types";
import { usePlayer } from "@/lib/usePlayer";
import styles from "./view.module.css";

/** True when a key press is meant for a form control, so page shortcuts must stay out of the way. */
const typingIn = (e: KeyboardEvent) => e.target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName) || e.target.isContentEditable);

type Panel = "search" | "soundbites" | "comments" | "bookmarks";
const RAIL: { id: Panel; label: string; icon: typeof Search }[] = [
  { id: "search", label: "Smart Search", icon: Search },
  { id: "soundbites", label: "Soundbites", icon: AudioLines },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "bookmarks", label: "Bookmarks", icon: BookmarkIcon },
];

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: meeting, error, reload } = useFetch<Meeting>(`/api/meetings/${id}`);
  const { data: lines = [], loading: linesLoading, error: linesError, reload: reloadLines } = useFetch<Segment[]>(`/api/meetings/${id}/transcript`);
  const { data: items = [], reload: reloadItems } = useFetch<ActionItem[]>(`/api/meetings/${id}/action-items`);
  const { data: insights, reload: reloadInsights } = useFetch<Insights>(`/api/meetings/${id}/insights`);
  const itemsChanged = () => {
    reloadItems();
    reloadInsights();
  };
  // renaming or changing people also changes speaker names in the transcript and the numbers beside it
  const meetingChanged = () => {
    reload();
    reloadLines();
    itemsChanged();
  };
  const { data: bookmarks = [], reload: reloadBookmarks } = useFetch<Bookmark[]>(`/api/meetings/${id}/bookmarks`);
  const toast = useToast();
  const [panel, setPanel] = useState<Panel | null>("search");
  const [commentTarget, setCommentTarget] = useState<number | null>(null);
  const [draft, setDraft] = useState<SoundbiteDraft | null>(null);
  const draftCount = useRef(0);
  const [exporting, setExporting] = useState(false);
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

  async function bookmarkNow() {
    try {
      await api(`/api/meetings/${id}/bookmarks`, send("POST", { time_sec: player.time }));
      reloadBookmarks();
      toast(`Bookmarked ${clock(player.time)}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

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
        {meeting && <div className={styles.menu}><MeetingMenu meeting={meeting} onChanged={meetingChanged} onDeleted={() => router.push("/meetings")} /></div>}
      </header>

      <div className={`${styles.body} ${panel ? styles.withPanel : ""}`}>
        <nav className={styles.rail} aria-label="Meeting tools">
          {RAIL.map(({ id: key, label, icon: Icon }) => (
            <button key={key} className={panel === key ? styles.railOn : ""} onClick={() => setPanel(panel === key ? null : key)} aria-label={label} aria-pressed={panel === key} title={label}>
              <Icon size={18} />
            </button>
          ))}
        </nav>
        {panel && meeting && (
          <aside className={styles.left} aria-label={RAIL.find((r) => r.id === panel)!.label}>
            {panel === "search" && (
              <>
                <h2>Smart Search</h2>
                <SmartSearch meeting={meeting} lines={lines} insights={insights} tasks={items} onSeek={(t) => player.seek(t)} onTagsChanged={reload} />
              </>
            )}
            {panel === "soundbites" && <SoundbitesPanel meetingId={meeting.id} duration={player.duration} time={player.time} draft={draft} onDraftDone={() => setDraft(null)} onPlay={player.playRange} onSeek={player.seek} />}
            {panel === "comments" && <CommentsPanel meetingId={meeting.id} lines={lines} time={player.time} target={commentTarget} onTargetChange={setCommentTarget} onSeek={player.seek} onChanged={reloadLines} />}
            {panel === "bookmarks" && <BookmarksPanel meetingId={meeting.id} bookmarks={bookmarks} time={player.time} onSeek={player.seek} onChanged={reloadBookmarks} />}
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
          {meeting && <TranscriptPanel
              meetingId={meeting.id} lines={lines} loading={linesLoading} error={linesError} player={player}
              onComment={(segmentId) => { setCommentTarget(segmentId); setPanel("comments"); }}
              onSoundbite={(start, end) => { setDraft({ id: ++draftCount.current, start, end }); setPanel("soundbites"); }}
            />}
        </aside>
      </div>

      <PlayerBar player={player}>
        <button className="btn btn-ghost btn-icon" onClick={bookmarkNow} aria-label="Bookmark this moment" title="Bookmark this moment"><Star size={18} /></button>
        <button className="btn btn-ghost btn-icon" onClick={() => setExporting(true)} aria-label="Download" title="Download"><Download size={18} /></button>
      </PlayerBar>
      {meeting && <ExportModal meetingId={meeting.id} open={exporting} onClose={() => setExporting(false)} />}
    </div>
  );
}
