"use client";
import { useRef, useState } from "react";
import { Calendar, Clock, Filter, Search, Tag, User, Users } from "lucide-react";
import { useDismiss } from "@/lib/hooks";
import { activeFilterCount, DATE_LABELS, DATE_ORDER, DURATION_LABELS, DURATION_ORDER, NO_FILTERS, toggle, type Filters } from "@/lib/meetingFilters";
import type { Person, Topic } from "@/lib/types";
import styles from "./FilterPopover.module.css";

type Section = "host" | "participant" | "date" | "duration" | "topic";
const SECTIONS: { id: Section; label: string; icon: typeof User }[] = [
  { id: "host", label: "Hosted by", icon: User },
  { id: "participant", label: "Participants", icon: Users },
  { id: "date", label: "Date range", icon: Calendar },
  { id: "duration", label: "Duration", icon: Clock },
  { id: "topic", label: "Tags", icon: Tag },
];

type Props = { filters: Filters; onChange: (patch: Partial<Filters>) => void; people: Person[]; topics: Topic[] };

export function FilterPopover({ filters, onChange, people, topics }: Props) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>("date");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);
  const count = activeFilterCount(filters);

  const choosePeople = (key: "host" | "participant") => {
    const shown = people.filter((p) => (p.name + (p.email ?? "")).toLowerCase().includes(search.toLowerCase()));
    return (
      <>
        <label className={styles.search}>
          <Search size={14} />
          <input placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" />
        </label>
        {shown.map((p) => (
          <label key={p.id} className={styles.option}>
            <span>
              {p.name}
              <small className="muted">{p.email}</small>
            </span>
            <input type="checkbox" checked={filters[key].includes(p.id)} onChange={() => onChange({ [key]: toggle(filters[key], p.id) })} />
          </label>
        ))}
        {shown.length === 0 && <p className="muted">No one matches</p>}
      </>
    );
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={`btn ${count ? styles.on : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
        <Filter size={14} /> Filters{count > 0 && ` (${count})`}
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Filters">
          <div className={styles.menu}>
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} className={section === id ? styles.current : ""} onClick={() => { setSection(id); setSearch(""); }}>
                <Icon size={15} /> {label}
              </button>
            ))}
            <button className={`btn ${styles.clear}`} disabled={count === 0} onClick={() => onChange({ ...NO_FILTERS, q: filters.q, channel: filters.channel, sort: filters.sort })}>
              Clear all filters
            </button>
          </div>
          <div className={styles.options}>
            {(section === "host" || section === "participant") && choosePeople(section)}
            {section === "date" && (
              <>
                {DATE_ORDER.map((d) => (
                  <label key={d} className={styles.option}>
                    {DATE_LABELS[d]}
                    <input type="radio" name="date" checked={filters.date === d} onChange={() => onChange({ date: d })} />
                  </label>
                ))}
                {filters.date === "custom" && (
                  <div className={styles.dates}>
                    <input type="date" className="input" aria-label="From" value={filters.from} max={filters.to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
                    <input type="date" className="input" aria-label="To" value={filters.to} min={filters.from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
                  </div>
                )}
              </>
            )}
            {section === "duration" &&
              DURATION_ORDER.map((d) => (
                <label key={d} className={styles.option}>
                  {DURATION_LABELS[d]}
                  <input type="radio" name="duration" checked={filters.duration === d} onChange={() => onChange({ duration: d })} />
                </label>
              ))}
            {section === "topic" && (
              <>
                {topics.map((t) => (
                  <label key={t.name} className={styles.option}>
                    <span>
                      {t.name} <small className="muted">{t.meeting_count}</small>
                    </span>
                    <input type="checkbox" checked={filters.topic.includes(t.name)} onChange={() => onChange({ topic: toggle(filters.topic, t.name) })} />
                  </label>
                ))}
                {topics.length === 0 && <p className="muted">No tags yet</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
