"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Copy, Loader2, Plus, SendHorizontal, Sparkles } from "lucide-react";
import { api, send } from "@/lib/api";
import { parseAnswer } from "@/lib/answer";
import { clock } from "@/lib/format";
import { useFetch, useLocalStorage } from "@/lib/hooks";
import type { AskResult, ChatMessage, LlmModels, Source } from "@/lib/types";
import { useToast } from "./Toast";
import styles from "./AskPanel.module.css";

const MEETING_SUGGESTIONS = ["Summarize this meeting", "What are the action items?", "What was decided about the budget?"];
const GLOBAL_SUGGESTIONS = ["List my action items & todos", "Summarize my last meeting", "Who is worried about Safari?"];

type Props = { meetingId: number | null; onSeek?: (sec: number) => void; greeting?: string };

/** Ask questions about one meeting (meetingId) or about all of them (null). Answers cite moments and say who wrote them. */
export function AskPanel({ meetingId, onSeek, greeting }: Props) {
  const toast = useToast();
  const scope = meetingId === null ? "" : `/meetings/${meetingId}`;
  const { data: history = [], reload } = useFetch<ChatMessage[]>(`/api/${meetingId === null ? "" : `meetings/${meetingId}/`}chat`);
  const { data: models } = useFetch<LlmModels>("/api/llm/models");
  const [saved, setSaved] = useLocalStorage<string>("askModel", "");
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null); // the question being answered right now
  const end = useRef<HTMLDivElement>(null);

  // "provider|model" of the choice in the picker; the server's default until the user picks one
  const options = useMemo(() => models?.providers.flatMap((p) => p.models.map((m) => `${p.name}|${m}`)) ?? [], [models]);
  const choice = options.includes(saved) ? saved : models ? `${models.default_provider}|${models.default_model}` : "";

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [history.length, pending]);

  async function ask(question: string) {
    if (!question.trim() || pending) return;
    const [provider, model] = choice.split("|");
    setPending(question.trim());
    setText("");
    try {
      await api<AskResult>(`/api${scope}/ask`, send("POST", { question: question.trim(), ...(choice && { provider, model }) }));
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
      setText(question); // give the question back so nothing typed is lost
    } finally {
      setPending(null);
    }
  }

  async function clear() {
    try {
      await api(`/api${scope}/chat`, send("DELETE"));
      reload();
      toast("Started a new chat");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const copy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast("Answer copied");
    } catch {
      toast("Could not copy. The browser blocked it.", "error");
    }
  };

  const empty = history.length === 0 && !pending;
  const label = (m: ChatMessage) => (m.provider === "mock" ? "Built-in answer" : `${m.provider} · ${m.model}`);

  return (
    <div className={styles.panel}>
      <div className={styles.messages} aria-live="polite">
        {empty && (
          <div className={styles.welcome}>
            <Sparkles size={22} color="var(--primary)" />
            <h2>{greeting ?? (meetingId === null ? "How can I help today?" : "Ask anything about this meeting")}</h2>
            <div className={styles.chips}>
              {(meetingId === null ? GLOBAL_SUGGESTIONS : MEETING_SUGGESTIONS).map((s) => (
                <button key={s} onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {history.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className={styles.user}>{m.content}</div>
          ) : (
            <div key={m.id} className={styles.bot}>
              <div className={styles.who}><Bot size={15} /> Sidenote <span className="muted">{label(m)}</span></div>
              <div className={styles.answer}>
                {parseAnswer(m.content).map((b, i) => {
                  const Tag = b.kind === "li" ? "li" : "p";
                  return (
                    <Tag key={i}>
                      {b.parts.map((p, k) => typeof p === "string" ? p : (
                        onSeek ? <button key={k} className={styles.cite} onClick={() => onSeek(p.time)} title="Jump to this moment">{p.label}</button> : p.label
                      ))}
                    </Tag>
                  );
                })}
              </div>
              {m.sources.length > 0 && <Sources sources={m.sources} global={meetingId === null} onSeek={onSeek} />}
              <button className={styles.copy} onClick={() => copy(m.content)} aria-label="Copy answer"><Copy size={13} /> Copy</button>
            </div>
          ),
        )}

        {pending && (
          <>
            <div className={styles.user}>{pending}</div>
            <div className={styles.bot}><div className={styles.who}><Loader2 size={15} className={styles.spin} /> Thinking…</div></div>
          </>
        )}
        <div ref={end} />
      </div>

      <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), ask(text))}
          placeholder={meetingId === null ? "Ask anything about your meetings" : "Ask anything about this meeting"}
          aria-label="Question"
          maxLength={1000}
        />
        <div className={styles.bar}>
          <select value={choice} onChange={(e) => setSaved(e.target.value)} aria-label="AI model" disabled={!models}>
            {models?.providers.map((p) => (
              <optgroup key={p.name} label={p.label}>
                {p.models.map((m) => <option key={m} value={`${p.name}|${m}`}>{m}</option>)}
              </optgroup>
            ))}
          </select>
          {history.length > 0 && <button type="button" className="btn btn-ghost" onClick={clear}><Plus size={14} /> New chat</button>}
          <button className={styles.send} disabled={!text.trim() || !!pending} aria-label="Send"><SendHorizontal size={16} /></button>
        </div>
      </form>
    </div>
  );
}

function Sources({ sources, global, onSeek }: { sources: Source[]; global: boolean; onSeek?: (sec: number) => void }) {
  return (
    <div className={styles.sources} aria-label="Sources">
      {sources.map((s) =>
        global || !onSeek ? (
          <Link key={s.segment_id} href={`/view/${s.meeting_id}?t=${Math.floor(s.start_sec)}`} className="chip">{s.meeting_title} · {clock(s.start_sec)}</Link>
        ) : (
          <button key={s.segment_id} className="chip" onClick={() => onSeek(s.start_sec)}>{clock(s.start_sec)} {s.speaker}</button>
        ),
      )}
    </div>
  );
}
