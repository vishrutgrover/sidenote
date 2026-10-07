"use client";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { avatarColor, initials } from "@/lib/format";
import { useDebounced, useFetch } from "@/lib/hooks";
import { query } from "@/lib/api";
import type { Person } from "@/lib/types";
import styles from "./people.module.css";

/** Everyone who has been in a meeting. */
export default function PeoplePage() {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const { data: people, error, reload } = useFetch<Person[]>("/api/people" + query({ q: text.trim() ? q : "" }));

  return (
    <div className={styles.page}>
      <label className={styles.search}>
        <Search size={15} />
        <input placeholder="Search by name or email" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search people" />
      </label>

      {error && !people && <div className="empty"><strong>Could not load people</strong><p>{error}</p><button className="btn" onClick={reload}>Try again</button></div>}
      {people?.length === 0 && <div className="empty"><strong>{q ? `No one matches “${q}”` : "No one yet"}</strong><p>People appear here once they are in a meeting.</p></div>}

      <ul className={styles.grid}>
        {people?.map((p) => (
          <li key={p.id}>
            <Link href={`/people/${p.id}`} className={`card ${styles.person}`}>
              <span className="avatar" style={{ background: avatarColor(p.id), width: 40, height: 40, fontSize: 14 }}>{initials(p.name)}</span>
              <span>
                <strong>{p.name}</strong>{p.is_me && <span className="badge-green" style={{ marginLeft: 8 }}>You</span>}
                <span className="muted">{p.email}</span>
              </span>
              <span className={`muted ${styles.count}`}>{p.meeting_count} meeting{p.meeting_count === 1 ? "" : "s"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
