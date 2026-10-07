import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonPage from "@/app/(app)/people/[id]/page";
import PeoplePage from "@/app/(app)/people/page";
import { ToastProvider } from "@/components/Toast";
import { item, mockApi, people } from "./helpers/fixtures";

let params = { id: "2" };
vi.mock("next/navigation", () => ({ useParams: () => params }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
beforeEach(() => { params = { id: "2" }; });

const detail = {
  ...people[1], total_talk_sec: 125, wpm: 150,
  meetings: [
    { id: 1, title: "Weekly Sync", started_at: "2026-10-07T18:00:00", talk_sec: 60, share_pct: 34 },
    { id: 2, title: "Design Review", started_at: "2026-10-06T18:00:00", talk_sec: 65, share_pct: 40 },
  ],
  open_tasks: [item({ id: 5, text: "Draft the copy", meeting_id: 1, meeting_title: "Weekly Sync", timestamp_sec: 83 }), item({ id: 6, text: "No time task", timestamp_sec: null, meeting_id: 2, meeting_title: "Design Review" })],
};
const page = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe("People page", () => {
  it("lists everyone with email, meeting count and a badge on you", async () => {
    mockApi({ "/api/people": people });
    page(<PeoplePage />);
    expect(await screen.findByText("Vishrut Grover")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("3 meetings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Maya Chen/ })).toHaveAttribute("href", "/people/2");
    expect(screen.getByText("2 meetings")).toBeInTheDocument();
  });

  it("uses the singular for one meeting", async () => {
    mockApi({ "/api/people": [{ ...people[1], meeting_count: 1 }] });
    page(<PeoplePage />);
    expect(await screen.findByText("1 meeting")).toBeInTheDocument();
  });

  it("searches after typing pauses, clears at once, and says when no one matches", async () => {
    const calls = mockApi({ "/api/people": people });
    page(<PeoplePage />);
    await screen.findByText("Vishrut Grover");
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "may" } });
    await waitFor(() => expect(calls.at(-1)).toBe("/api/people?q=may"));
    mockApi({ "/api/people": [] });
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "nobody" } });
    expect(await screen.findByText("No one matches “nobody”")).toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    let fail = true;
    mockApi({ "/api/people": () => (fail ? new Response(JSON.stringify({ detail: "Database is down" }), { status: 500 }) : people) });
    page(<PeoplePage />);
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Maya Chen")).toBeInTheDocument();
  });
});

describe("Person page", () => {
  it("shows the stats in plain words", async () => {
    mockApi({ "/api/people/2": detail });
    page(<PersonPage />);
    expect(await screen.findByRole("heading", { name: "Maya Chen" })).toBeInTheDocument();
    expect(screen.getByText("2 min 5 s")).toBeInTheDocument(); // 125 s of talking
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.queryByText("You")).toBeNull();
  });

  it("lists meetings with their talk time and share, each linking to the meeting", async () => {
    mockApi({ "/api/people/2": detail });
    page(<PersonPage />);
    const list = within(await screen.findByRole("region", { name: "Meetings" }));
    expect(list.getByRole("link", { name: /Weekly Sync/ })).toHaveAttribute("href", "/view/1");
    expect(list.getByText("1 min · 34%")).toBeInTheDocument();
    expect(list.getByTitle("40% of the talking")).toBeInTheDocument();
  });

  it("open tasks link to the moment, or just the meeting when there is no time", async () => {
    mockApi({ "/api/people/2": detail });
    page(<PersonPage />);
    const tasks = within(await screen.findByRole("region", { name: "Open tasks" }));
    expect(tasks.getByRole("link", { name: "Weekly Sync · 01:23" })).toHaveAttribute("href", "/view/1?t=83");
    expect(tasks.getByRole("link", { name: "Design Review" })).toHaveAttribute("href", "/view/2");
  });

  it("ticking a task is instant, saved, and refreshes the profile", async () => {
    const calls = mockApi({ "/api/people/2": detail, "/api/action-items/5": item({ is_done: true }) });
    page(<PersonPage />);
    fireEvent.click(await screen.findByLabelText('Mark "Draft the copy" done'));
    expect(screen.getByLabelText('Mark "Draft the copy" not done')).toBeChecked();
    await waitFor(() => expect(calls.requests!.find((r) => r.method === "PATCH")).toMatchObject({ path: "/api/action-items/5", body: { is_done: true } }));
    await waitFor(() => expect(calls.filter((c) => c === "/api/people/2").length).toBeGreaterThan(1)); // reloaded
  });

  it("a failed tick is put back with the message", async () => {
    mockApi({ "/api/people/2": detail, "/api/action-items/5": new Response(JSON.stringify({ detail: "Action item not found" }), { status: 404 }) });
    page(<PersonPage />);
    fireEvent.click(await screen.findByLabelText('Mark "Draft the copy" done'));
    expect(await screen.findByText("Action item not found")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Mark "Draft the copy" done')).not.toBeChecked());
  });

  it("says you are you, and handles someone with no meetings or tasks", async () => {
    params = { id: "1" };
    mockApi({ "/api/people/1": { ...people[0], total_talk_sec: 0, wpm: 0, meetings: [], open_tasks: [], meeting_count: 0 } });
    page(<PersonPage />);
    expect(await screen.findByText("You")).toBeInTheDocument();
    expect(screen.getByText("0 s")).toBeInTheDocument();
    expect(screen.getByText("Not in any meeting yet.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing open/)).toBeInTheDocument();
  });

  it("unknown people get a friendly page with a way back, other errors show the reason", async () => {
    mockApi({ "/api/people/2": () => new Response(JSON.stringify({ detail: "Person not found" }), { status: 404 }) });
    const { unmount } = page(<PersonPage />);
    expect(await screen.findByText("This person does not exist")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to people" })).toHaveAttribute("href", "/people");
    unmount();
    mockApi({ "/api/people/2": () => new Response(JSON.stringify({ detail: "Database is down" }), { status: 500 }) });
    page(<PersonPage />);
    expect(await screen.findByText("Could not load this person")).toBeInTheDocument();
    expect(screen.getByText("Database is down")).toBeInTheDocument();
  });
});
