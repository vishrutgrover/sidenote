import { query } from "./api";
import { localDayBounds } from "./format";

export type DateRange = "any" | "today" | "7" | "14" | "30" | "custom";
export type Duration = "any" | "lt15" | "15-30" | "30-60" | "60+";
export type Channel = "all" | "mine" | "uploads";

export type Filters = {
  q: string;
  channel: Channel;
  host: number[]; // person ids
  participant: number[];
  topic: string[];
  date: DateRange;
  from: string; // "YYYY-MM-DD", used when date is "custom"
  to: string;
  duration: Duration;
  sort: "recent" | "oldest";
};

export const NO_FILTERS: Filters = { q: "", channel: "all", host: [], participant: [], topic: [], date: "any", from: "", to: "", duration: "any", sort: "recent" };

/** Display order. (Object keys like "7" would be sorted before "any" by JavaScript.) */
export const DATE_ORDER: DateRange[] = ["any", "today", "7", "14", "30", "custom"];
export const DURATION_ORDER: Duration[] = ["any", "lt15", "15-30", "30-60", "60+"];
export const DATE_LABELS: Record<DateRange, string> = { any: "Any time", today: "Today", "7": "Last 7 days", "14": "Last 14 days", "30": "Last 30 days", custom: "Custom range" };
export const DURATION_LABELS: Record<Duration, string> = { any: "Any length", lt15: "Under 15 min", "15-30": "15 to 30 min", "30-60": "30 to 60 min", "60+": "Over 60 min" };
const DURATION_MINUTES: Record<Duration, [number?, number?]> = { any: [], lt15: [undefined, 15], "15-30": [15, 30], "30-60": [30, 60], "60+": [60, undefined] };

/** "2026-10-07" as a local date. Returns null for anything that is not a real date. */
function localDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null; // rejects 2026-02-31
}

/** The time window for the chosen date range, as UTC instants. Days are the viewer's local days. */
export function dateBounds(f: Pick<Filters, "date" | "from" | "to">, now = new Date()): { after?: string; before?: string } {
  if (f.date === "any") return {};
  if (f.date === "today") return localDayBounds(now);
  if (f.date === "custom") {
    const from = localDate(f.from), to = localDate(f.to);
    return { after: from ? localDayBounds(from).after : undefined, before: to ? localDayBounds(to).before : undefined };
  }
  const start = new Date(now);
  start.setDate(now.getDate() - (Number(f.date) - 1)); // "last 7 days" = today and the 6 before it
  return { after: localDayBounds(start).after, before: localDayBounds(now).before };
}

/** Query string for GET /api/meetings. meId is the logged-in person, used for the My Meetings channel. */
export function toQuery(f: Filters, meId: number | null, now = new Date()): string {
  const [min, max] = DURATION_MINUTES[f.duration];
  return query({
    q: f.q.trim(),
    host: f.host.length ? f.host : f.channel === "mine" && meId !== null ? [meId] : [],
    source: f.channel === "uploads" ? ["upload", "paste"] : [],
    participant: f.participant,
    topic: f.topic,
    ...dateBounds(f, now),
    min_minutes: min,
    max_minutes: max,
    sort: f.sort,
  });
}

/** How many filters the Filters button should say are active (search, sort and channel are separate controls). */
export function activeFilterCount(f: Filters): number {
  return [f.host.length > 0, f.participant.length > 0, f.topic.length > 0, f.date !== "any", f.duration !== "any"].filter(Boolean).length;
}

/** Add or remove a value from a list. */
export const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
