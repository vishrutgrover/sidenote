"use client";
import { useState } from "react";
import { Bot, Hash, LayoutList, Plus, Search, Upload } from "lucide-react";
import type { Channel } from "@/lib/meetingFilters";
import { useToast } from "./Toast";
import styles from "./ChannelList.module.css";

const CHANNELS: { id: Channel | "voice"; label: string; icon: typeof Hash; badge?: string; soon?: boolean }[] = [
  { id: "mine", label: "My Meetings", icon: Hash },
  { id: "all", label: "All Meetings", icon: LayoutList },
  { id: "voice", label: "Voice Agent Meetings", icon: Bot, soon: true },
  { id: "uploads", label: "Uploads", icon: Upload, badge: "NEW" },
];

export function ChannelList({ value, onChange }: { value: Channel; onChange: (c: Channel) => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const shown = CHANNELS.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <aside className={styles.panel} aria-label="Channels">
      <label className={styles.search}>
        <Search size={15} />
        <input placeholder="Search channels" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search channels" />
      </label>
      <nav>
        {shown.map(({ id, label, icon: Icon, badge, soon }) => (
          <button
            key={id}
            className={`${styles.item} ${id === value ? styles.active : ""}`}
            onClick={() => (soon ? toast(`${label} is coming soon`) : onChange(id as Channel))}
            aria-current={id === value ? "true" : undefined}
          >
            <Icon size={16} />
            {label}
            {badge && <span className="badge-green">{badge}</span>}
            {soon && <span className={styles.soon}>Soon</span>}
          </button>
        ))}
        {shown.length === 0 && <p className="muted" style={{ padding: 12 }}>No channels match</p>}
      </nav>
      <div className={styles.all}>
        <h2>All channels</h2>
        <Hash size={22} color="var(--primary)" />
        <p>Create channels to organize your conversations</p>
        <button className="btn" onClick={() => toast("Channels are coming soon")}>
          <Plus size={14} /> Channel
        </button>
      </div>
    </aside>
  );
}
