/** The API sends UTC times without a "Z". new Date() would read those as local time, so add it. */
export function parseServerDate(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z");
}

/** 83 -> "01:23", 3725 -> "62:05" (minutes keep counting, like the transcript shows). */
export function clock(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 560 -> "9 min", 20 -> "1 min" (never "0 min"), 3900 -> "1 h 5 min" */
export function duration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Heading for a group of meetings: Today, Yesterday, or "Oct 7". */
export function dayLabel(iso: string, now = new Date()): string {
  const d = parseServerDate(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
}

export const timeLabel = (iso: string) => parseServerDate(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "Oct 7 · 10:57 PM" */
export const dateTimeLabel = (iso: string) => `${dayLabel(iso)} · ${timeLabel(iso)}`;

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

/** Midnight to midnight of a local calendar day, as UTC instants the API understands. */
export function localDayBounds(day: Date): { after: string; before: string } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return { after: start.toISOString(), before: end.toISOString() };
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Good Night" : h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : h < 21 ? "Good Evening" : "Good Night";
}

/** What a person types for a time: "83", "1:23", "01:23.5" or "1:02:03". Returns null if it is not a time. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}
