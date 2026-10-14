"use client";
import { useState } from "react";
import { Check, Copy, Pencil, Plus, RefreshCw, Sparkles, Star, Trash2, X } from "lucide-react";
import { api, send } from "@/lib/api";
import { clock } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { notesToText } from "@/lib/notes";
import type { ActionItem, Meeting, Summary } from "@/lib/types";
import { ActionItems } from "./ActionItems";
import { useToast } from "./Toast";
import styles from "./NotesPanel.module.css";

type Draft = { overview: string; bullets: Record<number, string>; removed: number[]; added: Record<number, string[]> }; // added: new points per section id

/** Summary, sectioned notes with clickable moments, and action items. Notes can be edited or rewritten. */
export function NotesPanel({ meeting, items, onItemsChanged, onSeek }: { meeting: Meeting; items: ActionItem[]; onItemsChanged: () => void; onSeek: (sec: number) => void }) {
  const toast = useToast();
  const { data: summary, error, reload } = useFetch<Summary>(`/api/meetings/${meeting.id}/summary`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);

  if (error && !summary) return <p className="empty">{error}</p>;
  if (!summary) return <div className="skeleton" style={{ height: 240 }} />;

  const startEdit = () => setDraft({ overview: summary.overview, bullets: Object.fromEntries(summary.sections.flatMap((s) => s.bullets.map((b) => [b.id, b.text]))), removed: [], added: {} });

  const setAdded = (sectionId: number, change: (list: string[]) => string[]) =>
    setDraft((d) => d && { ...d, added: { ...d.added, [sectionId]: change(d.added[sectionId] ?? []) } });

  async function save() {
    if (!draft || !summary) return;
    setBusy(true);
    try {
      if (draft.overview.trim() !== summary.overview) await api(`/api/meetings/${meeting.id}/summary`, send("PATCH", { overview: draft.overview }));
      for (const b of summary.sections.flatMap((s) => s.bullets)) {
        if (draft.removed.includes(b.id)) {
          await api(`/api/note-bullets/${b.id}`, send("DELETE"));
          continue;
        }
        const text = draft.bullets[b.id]?.trim();
        if (text && text !== b.text) await api(`/api/note-bullets/${b.id}`, send("PATCH", { text }));
      }
      for (const [sectionId, texts] of Object.entries(draft.added)) {
        for (const text of texts.map((t) => t.trim()).filter(Boolean)) await api(`/api/note-sections/${sectionId}/bullets`, send("POST", { text }));
      }
      setDraft(null);
      reload();
      toast("Notes saved");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const r = await api<{ ai: { provider: string; model: string; status: string } }>(`/api/meetings/${meeting.id}/summary/regenerate`, send("POST"));
      reload();
      onItemsChanged();
      toast(r.ai.status === "ok" ? `Notes rewritten (${r.ai.provider})` : "The AI provider failed, so the built-in notes were used", r.ai.status === "ok" ? "success" : "error");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(notesToText(meeting.title, summary!.overview, summary!.sections));
      toast("Notes copied");
    } catch {
      toast("Could not copy. The browser blocked it.", "error");
    }
  }

  return (
    <div className={styles.notes}>
      <div className={styles.toolbar}>
        <span className={styles.label}><Sparkles size={15} /> General Summary</span>
        <div className={styles.buttons}>
          {draft ? (
            <>
              <button className="btn btn-primary" onClick={save} disabled={busy}><Check size={14} /> Save</button>
              <button className="btn" onClick={() => setDraft(null)} disabled={busy}><X size={14} /> Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-icon" onClick={copy} aria-label="Copy notes" title="Copy notes"><Copy size={16} /></button>
              <button className="btn btn-ghost" onClick={startEdit}><Pencil size={14} /> Edit</button>
              <button className="btn btn-ghost" onClick={regenerate} disabled={busy}><RefreshCw size={14} className={busy ? styles.spin : ""} /> Regenerate</button>
            </>
          )}
        </div>
      </div>

      {draft ? (
        <textarea className="input" rows={4} value={draft.overview} onChange={(e) => setDraft({ ...draft, overview: e.target.value })} aria-label="Summary text" maxLength={5000} />
      ) : (
        <p className={styles.overview}>{summary.overview || "No summary yet."}</p>
      )}

      {summary.keywords.length > 0 && !draft && (
        <div className={styles.keywords}>{summary.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
      )}

      {summary.sections.length > 0 && <h2 className={styles.heading}>Notes</h2>}
      {summary.sections.map((s) => (
        <section key={s.id} className={styles.section}>
          <h3>{s.title}</h3>
          <ul>
            {s.bullets.filter((b) => !draft?.removed.includes(b.id)).map((b) => (
              <li key={b.id}>
                {draft ? (
                  <span className={styles.edit}>
                    <input className="input" value={draft.bullets[b.id] ?? ""} onChange={(e) => setDraft({ ...draft, bullets: { ...draft.bullets, [b.id]: e.target.value } })} aria-label={`Note: ${b.text}`} />
                    <button className="btn btn-ghost btn-icon" onClick={() => setDraft({ ...draft, removed: [...draft.removed, b.id] })} aria-label={`Delete note: ${b.text}`} title="Delete this point"><Trash2 size={14} /></button>
                  </span>
                ) : (
                  <>
                    {b.text}{" "}
                    {b.timestamp_sec !== null && (
                      <button className={styles.stamp} onClick={() => onSeek(b.timestamp_sec!)} title="Jump to this moment">({clock(b.timestamp_sec)})</button>
                    )}
                  </>
                )}
              </li>
            ))}
            {draft?.added[s.id]?.map((text, i) => (
              <li key={`new${i}`}>
                <span className={styles.edit}>
                  <input className="input" autoFocus value={text} placeholder="New point" onChange={(e) => setAdded(s.id, (list) => list.map((t, k) => (k === i ? e.target.value : t)))} aria-label="New point" />
                  <button className="btn btn-ghost btn-icon" onClick={() => setAdded(s.id, (list) => list.filter((_, k) => k !== i))} aria-label="Remove new point" title="Remove"><X size={14} /></button>
                </span>
              </li>
            ))}
          </ul>
          {draft && <button className="btn btn-ghost" onClick={() => setAdded(s.id, (list) => [...list, ""])}><Plus size={14} /> Add point</button>}
        </section>
      ))}

      <ActionItems meetingId={meeting.id} items={items} participants={meeting.participants} onSeek={onSeek} onChange={onItemsChanged} />

      <div className={styles.rating}>
        <span>Did you like the summary?</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => { setRating(n); toast("Thanks for the feedback"); }} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating === n}>
            <Star size={18} fill={n <= rating ? "var(--primary)" : "none"} color={n <= rating ? "var(--primary)" : "var(--faint)"} />
          </button>
        ))}
      </div>
    </div>
  );
}
