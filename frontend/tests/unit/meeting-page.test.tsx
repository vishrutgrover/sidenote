import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeetingPage from "@/app/view/[id]/page";
import { ToastProvider } from "@/components/Toast";
import { bookmarks, comments, insights, items, meeting, mockApi, soundbites, summary, topics, transcript } from "./helpers/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "1" }), useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-10-10T12:00:00-07:00") });
});
afterEach(() => vi.useRealTimers());

const extras = { "/api/meetings/1/summary": summary, "/api/meetings/1/action-items": items, "/api/meetings/1/insights": insights, "/api/topics": topics, "/api/meetings/1/bookmarks": bookmarks, "/api/meetings/1/comments": comments, "/api/meetings/1/soundbites": soundbites };
const api = (m = meeting()) => mockApi({ ...extras, "/api/meetings/1/transcript": transcript, "/api/meetings/1": m });
const time = () => screen.getByLabelText("Time").textContent;

describe("Meeting page", () => {
  it("shows the title, host, date, length, people and summary", async () => {
    api();
    render(<MeetingPage />);
    expect(await screen.findByRole("heading", { name: "Weekly Sync" })).toBeInTheDocument();
    expect(screen.getByText(/Vishrut Grover · Oct 7 · 11:25 AM · 9 min/)).toBeInTheDocument();
    expect(screen.getByText("Maya Chen", { selector: ".chip" })).toBeInTheDocument();
    expect(await screen.findByText("They agreed to ship on Friday.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#All Meetings" })).toHaveAttribute("href", "/meetings");
    expect(await screen.findByText(/Welcome everyone/)).toBeInTheDocument();
  });

  it("clicking a note's moment, a task's moment or a filtered line moves the clock too", async () => {
    api();
    render(<MeetingPage />);
    fireEvent.click(await screen.findByText("(01:05)")); // a bullet in the notes
    expect(time()).toContain("01:05");
    fireEvent.click(screen.getAllByText("(01:23)")[0]); // an action item
    expect(time()).toContain("01:23");
  });

  it("the Smart Search rail button hides and shows the panel", async () => {
    api();
    render(<MeetingPage />);
    expect(await screen.findByRole("heading", { name: "Smart Search" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Smart Search" }));
    expect(screen.queryByRole("heading", { name: "Smart Search" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Smart Search" }));
    expect(await screen.findByRole("heading", { name: "Smart Search" })).toBeInTheDocument();
  });

  it("the rail switches between Smart Search, Soundbites, Comments and Bookmarks", async () => {
    api();
    render(<MeetingPage />);
    await screen.findByRole("heading", { name: "Smart Search" });
    fireEvent.click(screen.getByRole("button", { name: "Soundbites" }));
    expect(await screen.findByText("Soundbites · 2")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Smart Search" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    expect(await screen.findByText("Comments · 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bookmarks" }));
    expect(await screen.findByText("Bookmarks · 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bookmarks" })); // pressing the active one hides the panel
    expect(screen.queryByText("Bookmarks · 2")).toBeNull();
  });

  it("the scissors on a line opens Soundbites with that line's times filled in", async () => {
    api();
    render(<MeetingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Make a soundbite from 00:20" }));
    expect(await screen.findByLabelText("Start time")).toHaveValue("00:20");
    expect(screen.getByLabelText("End time")).toHaveValue("00:25");
  });

  it("the soundbite form from a line goes away once it is cancelled", async () => {
    api();
    render(<MeetingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Make a soundbite from 00:20" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Start time")).toBeNull();
  });

  it("the comment button on a line opens Comments aimed at that line", async () => {
    api();
    render(<MeetingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Comment on 00:30" }));
    expect(await screen.findByLabelText("Commenting on")).toHaveTextContent("00:30");
  });

  it("the star bookmarks the current time", async () => {
    const calls = mockApi({ ...extras, "/api/meetings/1/transcript": transcript, "/api/meetings/1": () => meeting() });
    render(<ToastProvider><MeetingPage /></ToastProvider>);
    fireEvent.click(await screen.findByText(/I agree, the launch date/)); // 00:20
    fireEvent.click(screen.getByRole("button", { name: "Bookmark this moment" }));
    expect(await screen.findByText("Bookmarked 00:20")).toBeInTheDocument();
    expect(calls.requests!.find((r) => r.method === "POST" && r.path.endsWith("/bookmarks"))).toMatchObject({ body: { time_sec: 20 } });
  });

  it("the download button opens the export dialog", async () => {
    api();
    render(<MeetingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Download" }));
    expect(screen.getByRole("dialog", { name: "Download meeting" })).toBeInTheDocument();
  });

  it("ticking a task refreshes both the list and the Smart Search numbers", async () => {
    const calls = mockApi({ ...extras, "/api/action-items/1": items[0], "/api/meetings/1/transcript": transcript, "/api/meetings/1": meeting() });
    render(<MeetingPage />);
    fireEvent.click(await screen.findByLabelText('Mark "Draft the copy" done'));
    await waitFor(() => expect(calls.filter((c) => c === "/api/meetings/1/insights")).toHaveLength(2));
    expect(calls.filter((c) => c === "/api/meetings/1/action-items")).toHaveLength(2);
  });

  it("clicking a line moves the clock to it", async () => {
    api();
    render(<MeetingPage />);
    fireEvent.click(await screen.findByText(/I agree, the launch date/));
    expect(time()).toBe("00:20 / 09:20");
    expect(document.querySelector('[data-line="3"]')).toHaveAttribute("aria-current", "true");
  });

  it("playing moves the highlight along without any click", async () => {
    api();
    render(<MeetingPage />);
    fireEvent.click(await screen.findByText(/First, the budget/)); // 00:10
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10500); });
    expect(document.querySelector('[data-line="3"]')).toHaveAttribute("aria-current", "true"); // 20.5s
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  });

  it("deleting the meeting from its menu goes back to the library", async () => {
    const calls = mockApi({ ...extras, "/api/meetings/1/transcript": transcript, "/api/meetings/1": () => meeting() });
    render(<ToastProvider><MeetingPage /></ToastProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Actions for/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/meetings"));
    expect(calls.requests!.some((r) => r.method === "DELETE")).toBe(true);
  });

  it("Space plays and pauses, arrows skip 5 seconds, but not while typing in the find box", async () => {
    api();
    render(<MeetingPage />);
    await screen.findByText(/Welcome everyone/);
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(time()).toContain("00:05");

    const find = screen.getByLabelText("Find in transcript");
    find.focus();
    fireEvent.keyDown(find, { code: "Space", key: " " });
    fireEvent.keyDown(find, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(time()).toContain("00:05");
  });

  it("does not hijack Space when a button has focus, or shortcuts with modifier keys", async () => {
    api();
    render(<MeetingPage />);
    await screen.findByText(/Welcome everyone/);
    const button = screen.getByRole("button", { name: "Forward 10 seconds" });
    fireEvent.keyDown(button, { code: "Space", key: " " });
    fireEvent.keyDown(document.body, { code: "Space", key: " ", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "ArrowRight", metaKey: true });
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(time()).toContain("00:00");
  });

  it("shows a processing state and keeps checking until the notes are ready", async () => {
    let ready = false;
    mockApi({ ...extras, "/api/meetings/1/transcript": transcript, "/api/meetings/1": () => meeting(ready ? { status: "ready" } : { status: "processing", overview: "" }) });
    render(<MeetingPage />);
    expect(await screen.findByText("Meeting summary is processing…")).toBeInTheDocument();
    ready = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(await screen.findByText("They agreed to ship on Friday.")).toBeInTheDocument(); // the notes appear once ready
    expect(screen.queryByText("Meeting summary is processing…")).toBeNull();
  });

  it("stops checking once ready", async () => {
    const calls = api();
    render(<MeetingPage />);
    await screen.findByText("They agreed to ship on Friday.");
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    const n = calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(calls.length).toBe(n);
  });

  it("explains a failed generation but still offers the transcript", async () => {
    api(meeting({ status: "failed" }));
    render(<MeetingPage />);
    expect(await screen.findByText("The notes could not be generated")).toBeInTheDocument();
    expect(await screen.findByText(/Welcome everyone/)).toBeInTheDocument();
  });

  it("says so when the meeting does not exist, with a way back", async () => {
    mockApi({ "/api/meetings/1": new Response(JSON.stringify({ detail: "Meeting not found" }), { status: 404 }) });
    render(<MeetingPage />);
    expect(await screen.findByText("This meeting does not exist")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to meetings" })).toHaveAttribute("href", "/meetings");
  });

  it("shows the server's message for other errors", async () => {
    mockApi({ "/api/meetings/1": new Response(JSON.stringify({ detail: "Database is down" }), { status: 500 }) });
    render(<MeetingPage />);
    expect(await screen.findByText("Could not load this meeting")).toBeInTheDocument();
    expect(screen.getByText("Database is down")).toBeInTheDocument();
  });

  it("copes with a meeting that has no participants and no summary", async () => {
    mockApi({ ...extras, "/api/meetings/1/summary": { overview: "", keywords: [], sections: [] }, "/api/meetings/1/transcript": transcript, "/api/meetings/1": meeting({ participants: [], overview: "" }) });
    render(<MeetingPage />);
    expect(await screen.findByText("No summary yet.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Weekly Sync" })).toBeInTheDocument());
  });
});
