import type { ActionItem } from "./types";

/** Action items grouped under the person they belong to, in order of first appearance, with Unassigned last. */
export function groupByAssignee(items: ActionItem[]): [string, ActionItem[]][] {
  const groups = new Map<string, ActionItem[]>();
  for (const item of items) {
    const who = item.assignee?.name ?? "Unassigned";
    groups.set(who, [...(groups.get(who) ?? []), item]);
  }
  return [...groups].sort(([a], [b]) => Number(a === "Unassigned") - Number(b === "Unassigned"));
}

export const openCount = (items: ActionItem[]) => items.filter((i) => !i.is_done).length;

/** stroke-dasharray for a ring of radius 9 showing pct percent. */
export function ringDash(pct: number): string {
  const circumference = 2 * Math.PI * 9;
  const filled = (Math.min(Math.max(pct, 0), 100) / 100) * circumference;
  return `${filled.toFixed(2)} ${circumference.toFixed(2)}`;
}

/** Plain text of the notes, for the copy button. */
export function notesToText(title: string, overview: string, sections: { title: string; bullets: { text: string }[] }[]): string {
  return [title, "", overview, ...sections.flatMap((s) => ["", s.title, ...s.bullets.map((b) => `- ${b.text}`)])].join("\n").trim();
}
