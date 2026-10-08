import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { dateTimeLabel, duration, initials } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import styles from "./MeetingCard.module.css";

export function MeetingCard({ meeting: m, actions }: { meeting: Meeting; actions?: React.ReactNode }) {
  const host = m.participants.find((p) => p.is_host) ?? m.participants[0];
  return (
    <div className={styles.row}>
      <Link href={`/view/${m.id}`} className={styles.card}>
        <span className="avatar" style={{ background: host?.color ?? "var(--primary)" }}>
          {initials(host?.name ?? "")}
        </span>
        <div className={styles.body}>
          <div className={styles.title}>
            {m.title}
            <ChevronRight size={14} />
            {m.status === "processing" && (
              <span className={styles.status}>
                <Loader2 size={12} className={styles.spin} /> Processing
              </span>
            )}
            {m.status === "failed" && <span className={`${styles.status} ${styles.failed}`}>Failed</span>}
          </div>
          <div className={`${styles.meta} muted`}>
            {dateTimeLabel(m.started_at)} · {duration(m.duration_sec)}
            {host && ` · ${host.name}`}
          </div>
          {m.overview && <p className={styles.overview}>{m.overview}</p>}
          {m.topics.length > 0 && (
            <div className={styles.tags}>
              {m.topics.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
      <div className={styles.side}>
        {actions}
        <Link href={`/view/${m.id}`} className={`btn ${styles.details}`} tabIndex={-1}>
          Details <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
