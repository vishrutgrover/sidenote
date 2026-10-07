"use client";
import { useState } from "react";
import { api, send } from "@/lib/api";
import type { Meeting } from "@/lib/types";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

type Props = { meeting: Meeting; open: boolean; onClose: () => void; onDeleted: () => void };

/** Ask before deleting a meeting, since its transcript, notes, tasks and comments go with it. */
export function ConfirmDelete({ meeting, open, onClose, onDeleted }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/meetings/${meeting.id}`, send("DELETE"));
      toast(`Deleted "${meeting.title}"`);
      onDeleted();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete this meeting?">
      <p>
        <strong>{meeting.title}</strong> will be removed together with its transcript, notes, action items, comments and chat. This cannot be undone.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <button className="btn" onClick={onClose} autoFocus>Cancel</button>
        <button className="btn btn-danger" onClick={remove} disabled={busy}>Delete</button>
      </div>
    </Modal>
  );
}
