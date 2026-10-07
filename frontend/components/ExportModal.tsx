"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { apiUrl, query } from "@/lib/api";
import { download } from "@/lib/download";
import { Modal } from "./Modal";
import styles from "./ExportModal.module.css";

type What = "transcript" | "summary";
const FORMATS: Record<What, { id: string; label: string }[]> = {
  transcript: ["pdf", "md", "txt", "json", "srt", "csv"].map((id) => ({ id, label: id.toUpperCase() })),
  summary: ["pdf", "md", "json"].map((id) => ({ id, label: id.toUpperCase() })),
};

type Props = { meetingId: number; open: boolean; onClose: () => void };

/** Download the transcript or the notes in a chosen format. */
export function ExportModal({ meetingId, open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Download meeting">
      <ExportForm meetingId={meetingId} onClose={onClose} />
    </Modal>
  );
}

function ExportForm({ meetingId, onClose }: Omit<Props, "open">) {
  const [what, setWhat] = useState<What>("transcript");
  const [format, setFormat] = useState("pdf");
  const [timestamps, setTimestamps] = useState(true);
  const [speakers, setSpeakers] = useState(true);

  const choose = (w: What) => {
    setWhat(w);
    if (!FORMATS[w].some((f) => f.id === format)) setFormat("pdf"); // e.g. SRT does not exist for notes
  };
  const go = () => {
    download(apiUrl(`/api/meetings/${meetingId}/export` + query({ what, format, timestamps, speakers: what === "transcript" ? speakers : undefined })));
    onClose();
  };

  return (
    <div className={styles.form}>
      <div className={styles.tabs} role="tablist">
        {(["transcript", "summary"] as const).map((w) => (
          <button key={w} role="tab" aria-selected={what === w} className={what === w ? styles.on : ""} onClick={() => choose(w)}>
            {w === "transcript" ? "Transcript" : "Summary"}
          </button>
        ))}
      </div>
      <div className={styles.formats} role="radiogroup" aria-label="Format">
        {FORMATS[what].map((f) => (
          <button key={f.id} role="radio" aria-checked={format === f.id} className={format === f.id ? styles.picked : ""} onClick={() => setFormat(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <label><input type="checkbox" checked={timestamps} onChange={(e) => setTimestamps(e.target.checked)} disabled={format === "srt"} /> Include timestamps{format === "srt" && <span className="muted"> (always in SRT)</span>}</label>
      {what === "transcript" && <label><input type="checkbox" checked={speakers} onChange={(e) => setSpeakers(e.target.checked)} /> Show speaker names</label>}
      <div className={styles.footer}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={go}><Download size={14} /> Download</button>
      </div>
    </div>
  );
}
