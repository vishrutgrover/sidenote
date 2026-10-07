"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { api, send } from "@/lib/api";
import type { Meeting } from "@/lib/types";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import styles from "./EditMeetingModal.module.css";

type Props = { meeting: Meeting; open: boolean; onClose: () => void; onSaved: () => void };

/** Rename a meeting and change who was in it. */
export function EditMeetingModal({ meeting, open, onClose, onSaved }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Edit meeting">
      <EditForm meeting={meeting} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function EditForm({ meeting, onClose, onSaved }: Omit<Props, "open">) {
  const toast = useToast();
  const [title, setTitle] = useState(meeting.title);
  const [people, setPeople] = useState(meeting.participants.map((p) => ({ name: p.name, host: p.is_host })));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = () => {
    const n = name.trim();
    if (n && !people.some((p) => p.name.toLowerCase() === n.toLowerCase())) setPeople([...people, { name: n, host: false }]);
    setName("");
  };
  const removed = meeting.participants.filter((p) => !people.some((q) => q.name === p.name)).length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("The title cannot be empty.");
    setBusy(true);
    setError("");
    try {
      await api(`/api/meetings/${meeting.id}`, send("PATCH", { title: title.trim(), participants: people.map((p) => p.name) }));
      toast("Meeting updated");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={save} className={styles.form}>
        <label className={styles.field}>
          Title
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        </label>

        <div className={styles.field}>
          Participants
          <ul className={styles.people}>
            {people.map((p) => (
              <li key={p.name} className="chip">
                {p.name}{p.host && <small>host</small>}
                {!p.host && <button type="button" onClick={() => setPeople(people.filter((q) => q !== p))} aria-label={`Remove ${p.name}`}><X size={12} /></button>}
              </li>
            ))}
          </ul>
          <div className={styles.add}>
            <input className="input" placeholder="Add a person" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} aria-label="Add a person" maxLength={200} />
            <button type="button" className="btn" onClick={add} disabled={!name.trim()}><Plus size={14} /> Add</button>
          </div>
          {removed > 0 && <span className="muted">Lines spoken by removed people stay in the transcript as Unknown.</span>}
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.footer}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>Save</button>
        </div>
      </form>
    </>
  );
}
