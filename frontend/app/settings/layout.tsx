"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { initials } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { SETTINGS_SECTIONS } from "@/lib/settingsSections";
import type { Me } from "@/lib/types";
import styles from "./settings.module.css";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { section } = useParams<{ section?: string }>();
  const { data: me } = useFetch<Me>("/api/me");
  const [filter, setFilter] = useState("");
  const shown = SETTINGS_SECTIONS.filter((s) => s.label.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className={styles.page}>
      <aside className={styles.side}>
        <Link href="/meetings" className="btn btn-ghost btn-icon" aria-label="Back to the app"><ArrowLeft size={18} /></Link>
        <div className={styles.me}>
          <span className="avatar" style={{ background: "var(--primary)", width: 36, height: 36 }}>{me ? initials(me.name) : ""}</span>
          <div>
            <strong>{me?.name}</strong>
            <div className="muted">{me?.email}</div>
          </div>
        </div>
        <div className={styles.scope} role="tablist">
          <button role="tab" aria-selected="true" className={styles.on}>Personal</button>
          <button role="tab" aria-selected="false" disabled title="Teams are coming soon">Team</button>
        </div>
        <nav aria-label="Settings sections">
          {shown.map((s, i) => (
            <div key={s.id}>
              {i > 0 && shown[i - 1].group !== s.group && <hr />}
              <Link href={`/settings/${s.id}`} className={`${styles.item} ${section === s.id ? styles.active : ""}`} aria-current={section === s.id ? "page" : undefined}>
                <s.icon size={17} /> {s.label}
              </Link>
            </div>
          ))}
          {shown.length === 0 && <p className="muted" style={{ padding: 12 }}>No settings match</p>}
        </nav>
      </aside>
      <main className={styles.main}>
        <label className={styles.search}>
          <Search size={15} />
          <input placeholder="Search settings" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search settings" />
        </label>
        {children}
      </main>
    </div>
  );
}
