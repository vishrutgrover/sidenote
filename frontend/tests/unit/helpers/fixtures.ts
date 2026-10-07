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
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, "");
    calls.push(path);
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => path.startsWith(k));
    if (!key) return new Response(JSON.stringify({ detail: `no mock for ${path}` }), { status: 404 });
    const value = routes[key];
    const result = await (typeof value === "function" ? (value as (u: string) => unknown)(path) : value);
    return result instanceof Response ? result : new Response(JSON.stringify(result));
  });
  return calls;
}
