import { vi } from "vitest";
import type { Meeting, Person, Topic } from "@/lib/types";

export const host = { id: 1, person_id: 1, name: "Vishrut Grover", email: "v@x.com", color: "#6C5CE7", is_host: true };
export const guest = { id: 2, person_id: 2, name: "Maya Chen", email: "maya@x.com", color: "#00B894", is_host: false };

export const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: 1, title: "Weekly Sync", started_at: "2026-10-07T18:25:00", duration_sec: 560, status: "ready", source: "seed", media_url: null,
  overview: "They agreed to ship.", participants: [host, guest], topics: ["product"], ...over,
});

export const people: Person[] = [
  { id: 1, name: "Vishrut Grover", email: "v@x.com", meeting_count: 3, is_me: true },
  { id: 2, name: "Maya Chen", email: "maya@x.com", meeting_count: 2, is_me: false },
];
export const topics: Topic[] = [{ name: "product", meeting_count: 2 }, { name: "hiring", meeting_count: 1 }];

type Handler = unknown | ((url: string) => unknown | Response);

/** Replace fetch with canned answers. Keys are matched against the start of the path; returns the list of requested paths. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: string[] & { requests?: { method: string; path: string; body: unknown }[] } = [];
  const requests: { method: string; path: string; body: unknown }[] = [];
  calls.requests = requests; // what was sent: method, path and parsed JSON body
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, "");
    calls.push(path);
    requests.push({ method: init?.method ?? "GET", path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => path.startsWith(k));
    if (!key) return new Response(JSON.stringify({ detail: `no mock for ${path}` }), { status: 404 });
    const value = routes[key];
    const result = await (typeof value === "function" ? (value as (u: string) => unknown)(path) : value);
    return result instanceof Response ? result : new Response(JSON.stringify(result));
  });
  return calls;
}

import type { Segment } from "@/lib/types";
import type { Player } from "@/lib/usePlayer";

export const line = (id: number, start: number, text: string, speaker: Segment["speaker"] = host): Segment => ({
  id, start_sec: start, end_sec: start + 5, text, sentiment: "neutral", speaker, match: false, comment_count: 0,
});

export const transcript: Segment[] = [
  line(1, 0, "Welcome everyone, let's plan the launch."),
  line(2, 10, "First, the budget is tight this quarter."),
  line(3, 20, "I agree, the launch date matters more.", { id: 2, person_id: 2, name: "Maya Chen", email: "maya@x.com", color: "#00B894", is_host: false }),
  line(4, 30, "Then we launch on Friday.", { id: 2, person_id: 2, name: "Maya Chen", email: "maya@x.com", color: "#00B894", is_host: false }),
  line(5, 40, "Great, budget approved."),
];

export const fakePlayer = (over: Partial<Player> = {}): Player => ({
  time: 0, duration: 60, playing: false, speed: 1,
  play: vi.fn(), pause: vi.fn(), toggle: vi.fn(), seek: vi.fn(), skip: vi.fn(), setSpeed: vi.fn(), ...over,
});


import type { ActionItem, Insights, Summary } from "@/lib/types";

export const summary: Summary = {
  overview: "They agreed to ship on Friday.",
  keywords: ["launch", "budget"],
  sections: [
    { id: 1, title: "Launch plan", bullets: [{ id: 11, text: "Ship on Friday", timestamp_sec: 30 }, { id: 12, text: "Budget is tight", timestamp_sec: null }] },
    { id: 2, title: "Next steps", bullets: [{ id: 21, text: "Write the announcement", timestamp_sec: 65 }] },
  ],
};

const seat = (id: number, name: string) => ({ id, person_id: id, name, email: null, color: "#6C5CE7", is_host: id === 1 });
export const item = (over: Partial<ActionItem> = {}): ActionItem => ({
  id: 1, meeting_id: 1, meeting_title: "Weekly Sync", text: "Draft the copy", assignee: seat(2, "Maya Chen"), timestamp_sec: 83, due_date: null, is_done: false, ...over,
});
export const items: ActionItem[] = [
  item({ id: 1, text: "Draft the copy" }),
  item({ id: 2, text: "Book a room", assignee: null, timestamp_sec: null }),
  item({ id: 3, text: "Send the invite", assignee: seat(1, "Vishrut Grover"), is_done: true }),
  item({ id: 4, text: "Review the plan" }),
];

export const insights: Insights = {
  sentiments: { positive: { count: 2, pct: 40 }, neutral: { count: 3, pct: 55 }, negative: { count: 1, pct: 5 } },
  speakers: [
    { participant_id: 1, name: "Vishrut Grover", color: "#6C5CE7", talk_sec: 120, share_pct: 66, wpm: 180 },
    { participant_id: 2, name: "Maya Chen", color: "#00B894", talk_sec: 60, share_pct: 34, wpm: 150 },
  ],
  filters: { questions: [2], metrics: [], dates_times: [4, 5], tasks: [1, 2] },
};
