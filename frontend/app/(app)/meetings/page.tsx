"use client";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { ChannelList } from "@/components/ChannelList";
import { FilterPopover } from "@/components/FilterPopover";
import { MeetingCard } from "@/components/MeetingCard";
import { useDebounced, useFetch } from "@/lib/hooks";
import { dayLabel } from "@/lib/format";
import { activeFilterCount, DATE_LABELS, DURATION_LABELS, NO_FILTERS, toggle, toQuery, type Filters } from "@/lib/meetingFilters";
import type { Me, Meeting, Person, Topic } from "@/lib/types";
import styles from "./meetings.module.css";

/** Meetings in the order given, split under Today / Yesterday / date headings. */
function groupByDay(meetings: Meeting[]): [string, Meeting[]][] {
  const groups: [string, Meeting[]][] = [];
  for (const m of meetings) {
    const label = dayLabel(m.started_at);
    if (groups.at(-1)?.[0] === label) groups.at(-1)![1].push(m);
    else groups.push([label, [m]]);
  }
  return groups;
}

export default function MeetingsPage() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));
  const q = useDebounced(filters.q, 250);

  const { data: me } = useFetch<Me>("/api/me");
  const { data: people = [] } = useFetch<Person[]>("/api/people");
  const { data: topics = [] } = useFetch<Topic[]>("/api/topics");

  const waitingForMe = filters.channel === "mine" && !me; // "My Meetings" needs to know who I am
  const path = useMemo(() => (waitingForMe ? null : "/api/meetings" + toQuery({ ...filters, q }, me?.person_id ?? null)), [filters, q, me, waitingForMe]);
  const { data: meetings, error, loading, reload } = useFetch<Meeting[]>(path);

  const nameOf = (id: number) => people.find((p) => p.id === id)?.name ?? "someone";
  const chips = [
    ...filters.host.map((id) => ({ label: `Hosted by ${nameOf(id)}`, clear: () => patch({ host: toggle(filters.host, id) }) })),
    ...filters.participant.map((id) => ({ label: `With ${nameOf(id)}`, clear: () => patch({ participant: toggle(filters.participant, id) }) })),
    ...filters.topic.map((t) => ({ label: `#${t}`, clear: () => patch({ topic: toggle(filters.topic, t) }) })),
    ...(filters.date !== "any" ? [{ label: DATE_LABELS[filters.date], clear: () => patch({ date: "any", from: "", to: "" }) }] : []),
    ...(filters.duration !== "any" ? [{ label: DURATION_LABELS[filters.duration], clear: () => patch({ duration: "any" }) }] : []),
  ];
  const narrowed = activeFilterCount(filters) > 0 || q.trim() !== "";

  return (
    <div className={styles.page}>
      <ChannelList value={filters.channel} onChange={(channel) => patch({ channel })} />
      <section className={styles.main}>
        <div className={styles.toolbar}>
          <FilterPopover filters={filters} onChange={patch} people={people} topics={topics} />
          <label className={styles.search}>
            <Search size={15} />
            <input placeholder="Search title or participant" value={filters.q} onChange={(e) => patch({ q: e.target.value })} aria-label="Search meetings" />
            {filters.q && (
              <button onClick={() => patch({ q: "" })} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </label>
          <select className={`input ${styles.sort}`} value={filters.sort} onChange={(e) => patch({ sort: e.target.value as Filters["sort"] })} aria-label="Sort">
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {chips.length > 0 && (
          <div className={styles.chips}>
            {chips.map((c) => (
              <span key={c.label} className="chip">
                {c.label}
                <button onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className={styles.list} aria-busy={loading}>
          {!meetings && !error && [0, 1, 2, 3].map((i) => <div key={i} className={`skeleton ${styles.skeleton}`} />)}

          {error && !meetings && (
            <div className="empty">
              <strong>Could not load meetings</strong>
              <p>{error}</p>
              <button className="btn" onClick={reload}>
                Try again
              </button>
            </div>
          )}

          {meetings?.length === 0 &&
            (narrowed ? (
              <div className="empty">
                <strong>No meetings match</strong>
                <p>Try different keywords or remove a filter.</p>
                <button className="btn" onClick={() => setFilters({ ...NO_FILTERS, channel: filters.channel })}>
                  Clear search and filters
                </button>
              </div>
            ) : (
              <div className="empty">
                <strong>Looks like you haven&apos;t recorded a meeting yet</strong>
                <p>Upload a transcript and it will show up here.</p>
              </div>
            ))}

          {meetings && meetings.length > 0 && (
            <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.15s" }}>
              {groupByDay(meetings).map(([label, group]) => (
                <section key={label} className={styles.group}>
                  <h2>{label}</h2>
                  {group.map((m) => (
                    <MeetingCard key={m.id} meeting={m} />
                  ))}
                </section>
              ))}
              <p className={`muted ${styles.end}`}>You&apos;ve reached the end of your meetings.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
