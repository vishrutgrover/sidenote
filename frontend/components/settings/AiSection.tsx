"use client";
import { useFetch, useLocalStorage } from "@/lib/hooks";
import { dateTimeLabel } from "@/lib/format";
import type { LlmModels } from "@/lib/types";
import styles from "./settings.module.css";

type Run = { id: number; meeting_id: number | null; task: string; provider: string; model: string; latency_ms: number; status: string; error: string | null; created_at: string };

export function AiSection() {
  const { data: models } = useFetch<LlmModels>("/api/llm/models");
  const { data: runs = [] } = useFetch<Run[]>("/api/ai-runs?limit=20");
  const [saved, setSaved] = useLocalStorage<string>("askModel", "");

  const options = models?.providers.flatMap((p) => p.models.map((m) => `${p.name}|${m}`)) ?? [];
  const choice = options.includes(saved) ? saved : models ? `${models.default_provider}|${models.default_model}` : "";

  return (
    <>
      <h1>AI Settings</h1>
      <section className={`card ${styles.card}`}>
        <h2>Model for Ask Sidenote</h2>
        <p className="muted">Used for new questions. Notes for new meetings use the server default ({models ? `${models.default_provider} · ${models.default_model}` : "…"}).</p>
        <select className="input" style={{ maxWidth: 320 }} value={choice} onChange={(e) => setSaved(e.target.value)} disabled={!models} aria-label="Default model">
          {models?.providers.map((p) => (
            <optgroup key={p.name} label={p.label}>
              {p.models.map((m) => <option key={m} value={`${p.name}|${m}`}>{m}</option>)}
            </optgroup>
          ))}
        </select>
      </section>

      <section className={`card ${styles.card}`}>
        <h2>Providers</h2>
        <p className="muted">A provider appears here once its API key is set on the server (see <code>backend/.env.example</code>). Without any key the built-in logic answers.</p>
        <ul className={styles.providers}>
          {models?.providers.map((p) => <li key={p.name}><strong>{p.label}</strong> <span className="muted">{p.models.join(", ")}</span></li>)}
        </ul>
      </section>

      <section className={`card ${styles.card}`}>
        <h2>Recent AI activity</h2>
        {runs.length === 0 ? (
          <p className="muted">Nothing yet. Ask a question or regenerate notes and the call will be listed here.</p>
        ) : (
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Task</th><th>Provider</th><th>Model</th><th>Time</th><th>Result</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{dateTimeLabel(r.created_at)}</td>
                  <td>{r.task === "ask" ? "Question" : "Notes"}</td>
                  <td>{r.provider}</td>
                  <td>{r.model}</td>
                  <td>{r.latency_ms} ms</td>
                  <td title={r.error ?? undefined}><span className={r.status === "ok" ? "badge-green" : styles.warn}>{r.status === "ok" ? "OK" : "Fell back to built-in"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
