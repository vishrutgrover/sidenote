import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeetingPage from "@/app/view/[id]/page";
import { meeting, mockApi, transcript } from "./helpers/fixtures";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "1" }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-10-10T12:00:00-07:00") });
});
afterEach(() => vi.useRealTimers());

const api = (m = meeting()) => mockApi({ "/api/meetings/1/transcript": transcript, "/api/meetings/1": m });
const time = () => screen.getByLabelText("Time").textContent;

describe("Meeting page", () => {
  it("shows the title, host, date, length, people and summary", async () => {
    api();
    render(<MeetingPage />);
    expect(await screen.findByRole("heading", { name: "Weekly Sync" })).toBeInTheDocument();
    expect(screen.getByText(/Vishrut Grover · Oct 7 · 11:25 AM · 9 min/)).toBeInTheDocument();
    expect(screen.getByText("Maya Chen", { selector: ".chip" })).toBeInTheDocument();
    expect(screen.getByText("They agreed to ship.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#All Meetings" })).toHaveAttribute("href", "/meetings");
    expect(await screen.findByText(/Welcome everyone/)).toBeInTheDocument();
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
    mockApi({ "/api/meetings/1/transcript": transcript, "/api/meetings/1": () => meeting(ready ? { overview: "Fresh notes." } : { status: "processing", overview: "" }) });
    render(<MeetingPage />);
    expect(await screen.findByText("Meeting summary is processing…")).toBeInTheDocument();
    ready = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(await screen.findByText("Fresh notes.")).toBeInTheDocument();
    expect(screen.queryByText("Meeting summary is processing…")).toBeNull();
  });

  it("stops checking once ready", async () => {
    const calls = api();
    render(<MeetingPage />);
    await screen.findByText("They agreed to ship.");
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
    api(meeting({ participants: [], overview: "" }));
    render(<MeetingPage />);
    expect(await screen.findByText("No summary yet.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Weekly Sync" })).toBeInTheDocument());
  });
});
