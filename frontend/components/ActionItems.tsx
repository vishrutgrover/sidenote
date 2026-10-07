"use client";
import { useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { api, send } from "@/lib/api";
import { clock } from "@/lib/format";
import { groupByAssignee, openCount } from "@/lib/notes";
import type { ActionItem, Participant } from "@/lib/types";
import { useToast } from "./Toast";
import styles from "./ActionItems.module.css";

type Props = { meetingId: number; items: ActionItem[]; participants: Participant[]; onSeek: (sec: number) => void; onChange: () => void };

/** To-dos grouped by person. Tick, rename, reassign, delete and add all save straight away. */
export function ActionItems({ meetingId, items, participants, onSeek, onChange }: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  // A tick shows at once. It is tied to the exact list it was made on, so as soon as the list is
  // reloaded (a new array) the server's answer takes over and the tick is forgotten.
  const [ticks, setTicks] = useState<Record<number, { value: boolean; list: ActionItem[] }>>({});
  const isDone = (i: ActionItem) => (ticks[i.id]?.list === items ? ticks[i.id].value : i.is_done);

  async function run(request: Promise<unknown>) {
    try {
      await request;
      onChange();
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  }
  const patch = (id: number, body: object) => run(api(`/api/action-items/${id}`, send("PATCH", body)));

  async function toggle(item: ActionItem) {
    const value = !isDone(item);
    setTicks((t) => ({ ...t, [item.id]: { value, list: items } }));
    if (!(await patch(item.id, { is_done: value }))) {
      // save failed: put it back
      setTicks((t) => {
        const rest = { ...t };
        delete rest[item.id];
        return rest;
      });
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const original = items.find((i) => i.id === editing.id);
    if (editing.text.trim() && editing.text.trim() !== original?.text) await patch(editing.id, { text: editing.text.trim() });
    setEditing(null);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = { text: text.trim(), assignee_id: assignee ? Number(assignee) : null };
    if (await run(api(`/api/meetings/${meetingId}/action-items`, send("POST", body)))) setText("");
  }

  const open = openCount(items);
  return (
    <section className={styles.section} aria-label="Action items">
      <h2>Action items</h2>
      <div className={styles.banner}>
        <Sparkles size={15} />
        {items.length === 0 ? "No action items yet." : open === 0 ? "All done. Nothing left to do." : <>This call has <strong>{open}</strong> to do{open === 1 ? "" : "s"} left.</>}
      </div>

      {groupByAssignee(items).map(([who, group]) => (
        <div key={who} className={styles.group}>
          <h3>{who}</h3>
          <ul>
            {group.map((item) => (
              <li key={item.id} className={`${styles.item} ${isDone(item) ? styles.done : ""}`}>
                <input type="checkbox" checked={isDone(item)} onChange={() => toggle(item)} aria-label={`Mark "${item.text}" ${isDone(item) ? "not done" : "done"}`} />
                {editing?.id === item.id ? (
                  <input
                    className="input"
                    autoFocus
                    value={editing.text}
                    onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                    onBlur={saveEdit}
                    onKeyDown={(e) => (e.key === "Enter" ? saveEdit() : e.key === "Escape" && setEditing(null))}
                    aria-label="Edit action item"
                  />
                ) : (
                  <button className={styles.text} onClick={() => setEditing({ id: item.id, text: item.text })} title="Click to edit">
                    {item.text}
                  </button>
                )}
                {item.timestamp_sec !== null && (
                  <button className={styles.stamp} onClick={() => onSeek(item.timestamp_sec!)} title="Jump to this moment">
                    ({clock(item.timestamp_sec)})
                  </button>
                )}
                <select className={styles.who} value={item.assignee?.id ?? ""} onChange={(e) => patch(item.id, { assignee_id: e.target.value ? Number(e.target.value) : null })} aria-label={`Assignee of "${item.text}"`}>
                  <option value="">Unassigned</option>
                  {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className={styles.remove} onClick={() => run(api(`/api/action-items/${item.id}`, send("DELETE")))} aria-label={`Delete "${item.text}"`}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <form className={styles.add} onSubmit={add}>
        <input className="input" placeholder="Add an action item" value={text} onChange={(e) => setText(e.target.value)} aria-label="New action item" maxLength={1000} />
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assign to">
          <option value="">Unassigned</option>
          {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn btn-primary" disabled={!text.trim()}><Plus size={14} /> Add</button>
      </form>
    </section>
  );
}
