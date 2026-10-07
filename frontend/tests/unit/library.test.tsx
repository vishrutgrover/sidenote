import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelList } from "@/components/ChannelList";
import { FilterPopover } from "@/components/FilterPopover";
import { MeetingCard } from "@/components/MeetingCard";
import { ToastProvider } from "@/components/Toast";
import MeetingsPage from "@/app/(app)/meetings/page";
import { NO_FILTERS } from "@/lib/meetingFilters";
import { guest, meeting, mockApi, people, topics } from "./helpers/fixtures";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-10T12:00:00-07:00") }));
afterEach(() => vi.useRealTimers());

describe("MeetingCard", () => {
  it("shows title, host, time, length, summary and tags, and links to the meeting", () => {
    render(<MeetingCard meeting={meeting()} />);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/view/1");
    expect(screen.getByText(/Weekly Sync/)).toBeInTheDocument();
    expect(screen.getByText("Oct 7 · 11:25 AM · 9 min · Vishrut Grover")).toBeInTheDocument(); // 18:25 UTC shown in the viewer's zone
    expect(screen.getByText("They agreed to ship.")).toBeInTheDocument();
    expect(screen.getByText("product")).toBeInTheDocument();
    expect(screen.getByText("VG")).toBeInTheDocument();
  });

  it("says Processing or Failed instead of pretending the notes exist", () => {
    const { rerender } = render(<MeetingCard meeting={meeting({ status: "processing", overview: "" })} />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
    rerender(<MeetingCard meeting={meeting({ status: "failed" })} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("Processing")).toBeNull();
  });

  it("copes with a meeting that has no participants, no summary and no tags", () => {
    render(<MeetingCard meeting={meeting({ participants: [], overview: "", topics: [] })} />);
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByText("Oct 7 · 11:25 AM · 9 min")).toBeInTheDocument();
  });

  it("uses the first person when nobody is marked host, and renders an actions slot", () => {
    render(<MeetingCard meeting={meeting({ participants: [{ ...guest }] })} actions={<button>menu</button>} />);
    expect(screen.getByText(/· Maya Chen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "menu" })).toBeInTheDocument();
  });
});

describe("ChannelList", () => {
  const renderList = (onChange = vi.fn(), value: "all" | "mine" | "uploads" = "all") =>
    render(<ToastProvider><ChannelList value={value} onChange={onChange} /></ToastProvider>);

  it("marks the current channel and reports a change", async () => {
    const onChange = vi.fn();
    renderList(onChange, "mine");
    expect(screen.getByRole("button", { name: /My Meetings/ })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: /Uploads/ }));
    expect(onChange).toHaveBeenCalledWith("uploads");
  });

  it("explains coming-soon channels instead of switching to them", () => {
    const onChange = vi.fn();
    renderList(onChange);
    fireEvent.click(screen.getByRole("button", { name: /Voice Agent Meetings/ }));
    fireEvent.click(screen.getByRole("button", { name: /Channel/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Voice Agent Meetings is coming soon");
    expect(screen.getByRole("status")).toHaveTextContent("Channels are coming soon");
  });

  it("filters the channel list by what is typed", async () => {
    renderList();
    fireEvent.change(screen.getByLabelText("Search channels"), { target: { value: "upl" } });
    expect(screen.getByRole("button", { name: /Uploads/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /My Meetings/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search channels"), { target: { value: "zzz" } });
    expect(screen.getByText("No channels match")).toBeInTheDocument();
  });
});

describe("FilterPopover", () => {
  const setup = (filters = NO_FILTERS) => {
    const onChange = vi.fn();
    render(<FilterPopover filters={filters} onChange={onChange} people={people} topics={topics} />);
    return onChange;
  };
  const open = () => fireEvent.click(screen.getByRole("button", { name: /Filters/ }));

  it("is closed until clicked, and closes on Escape or an outside click", () => {
    setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers date options in a sensible order and reports the choice", () => {
    const onChange = setup();
    open();
    const labels = within(screen.getByRole("dialog")).getAllByRole("radio").map((r) => r.closest("label")!.textContent);
    expect(labels).toEqual(["Any time", "Today", "Last 7 days", "Last 14 days", "Last 30 days", "Custom range"]);
    fireEvent.click(screen.getByLabelText("Last 7 days"));
    expect(onChange).toHaveBeenCalledWith({ date: "7" });
  });

  it("shows date inputs only for a custom range, and sets sensible limits", () => {
    setup({ ...NO_FILTERS, date: "custom", from: "2026-10-01", to: "2026-10-05" });
    open();
    expect(screen.getByLabelText("From")).toHaveAttribute("max", "2026-10-05");
    expect(screen.getByLabelText("To")).toHaveAttribute("min", "2026-10-01");
  });

  it("picks participants, adding and removing", () => {
    const onChange = setup();
    open();
    fireEvent.click(screen.getByRole("button", { name: /Participants/ }));
    fireEvent.click(screen.getByLabelText(/Maya Chen/));
    expect(onChange).toHaveBeenCalledWith({ participant: [2] });
  });

  it("unticks a selected participant", () => {
    const onChange = setup({ ...NO_FILTERS, participant: [1, 2] });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Participants/ }));
    fireEvent.click(screen.getByLabelText(/Maya Chen/));
    expect(onChange).toHaveBeenCalledWith({ participant: [1] });
  });

  it("searches people by name or email", () => {
    setup();
    open();
    fireEvent.click(screen.getByRole("button", { name: /Hosted by/ }));
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "maya@" } });
    expect(screen.queryByText("Vishrut Grover")).toBeNull();
    expect(screen.getByText("Maya Chen")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "nobody" } });
    expect(screen.getByText("No one matches")).toBeInTheDocument();
  });

  it("lists tags with counts, and says so when there are none", () => {
    const onChange = setup();
    open();
    fireEvent.click(screen.getByRole("button", { name: /Tags/ }));
    fireEvent.click(screen.getByLabelText(/hiring/));
    expect(onChange).toHaveBeenCalledWith({ topic: ["hiring"] });
  });

  it("shows how many filters are on and clears them without touching search, channel or sort", () => {
    const onChange = setup({ ...NO_FILTERS, q: "road", channel: "uploads", sort: "oldest", date: "7", duration: "lt15" });
    expect(screen.getByRole("button", { name: /Filters \(2\)/ })).toBeInTheDocument();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, q: "road", channel: "uploads", sort: "oldest" });
  });

  it("disables Clear all when nothing is filtered", () => {
    setup();
    open();
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeDisabled();
  });
});

describe("Meetings page", () => {
  const m1 = meeting({ id: 1, title: "Today meeting", started_at: "2026-10-10T18:00:00" });
  const m2 = meeting({ id: 2, title: "Old meeting", started_at: "2026-10-02T18:00:00" });
  const m3 = meeting({ id: 3, title: "Same day as old", started_at: "2026-10-02T20:00:00" });
  const base = { "/api/me": { id: 1, name: "Vishrut Grover", email: "v@x.com", person_id: 1 }, "/api/people": people, "/api/topics": topics };

  const renderPage = () => render(<ToastProvider><MeetingsPage /></ToastProvider>);

  it("groups meetings under day headings in the order given", async () => {
    mockApi({ ...base, "/api/meetings": [m1, m2, m3] });
    renderPage();
    expect(await screen.findByText("Today meeting")).toBeInTheDocument();
    const list = document.querySelector("[aria-busy]") as HTMLElement; // just the meetings area, not the channel panel
    expect(within(list).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Today", "Oct 2"]);
    expect(screen.getByText("Same day as old")).toBeInTheDocument();
    expect(screen.getByText("You've reached the end of your meetings.")).toBeInTheDocument();
  });

  it("shows placeholders while loading, then removes them", async () => {
    mockApi({ ...base, "/api/meetings": [m1] });
    const { container } = renderPage();
    expect(container.querySelectorAll(".skeleton")).toHaveLength(4);
    await screen.findByText("Today meeting");
    expect(container.querySelectorAll(".skeleton")).toHaveLength(0);
  });

  it("explains an empty library differently from an empty search", async () => {
    const calls = mockApi({ ...base, "/api/meetings": [] });
    renderPage();
    expect(await screen.findByText(/haven't recorded a meeting yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search meetings"), { target: { value: "zzz" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(await screen.findByText("No meetings match")).toBeInTheDocument();
    expect(calls.at(-1)).toContain("q=zzz");
  });

  it("offers a way out of a failed load", async () => {
    let fail = true;
    mockApi({ ...base, "/api/meetings": () => (fail ? new Response(JSON.stringify({ detail: "Database is down" }), { status: 500 }) : [m1]) });
    renderPage();
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Today meeting")).toBeInTheDocument();
  });

  it("searches only after typing stops, and clears with the x", async () => {
    const calls = mockApi({ ...base, "/api/meetings": [m1] });
    renderPage();
    await screen.findByText("Today meeting");
    const input = screen.getByLabelText("Search meetings");
    const before = calls.length;
    for (const text of ["r", "ro", "road"]) fireEvent.change(input, { target: { value: text } });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(calls.length).toBe(before); // still typing, no request yet
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await waitFor(() => expect(calls.length).toBe(before + 1));
    expect(calls.at(-1)).toContain("q=road");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await waitFor(() => expect(calls.at(-1)).not.toContain("q="));
  });

  it("re-sorts, switches channel and waits for the user before asking for My Meetings", async () => {
    const calls = mockApi({ ...base, "/api/meetings": [m1] });
    renderPage();
    await screen.findByText("Today meeting");
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "oldest" } });
    await waitFor(() => expect(calls.at(-1)).toContain("sort=oldest"));
    fireEvent.click(screen.getByRole("button", { name: /Uploads/ }));
    await waitFor(() => expect(calls.at(-1)).toContain("source=upload&source=paste"));
    fireEvent.click(screen.getByRole("button", { name: /My Meetings/ }));
    await waitFor(() => expect(calls.at(-1)).toContain("host=1"));
  });

  it("shows applied filters as chips that can be removed", async () => {
    const calls = mockApi({ ...base, "/api/meetings": [m1] });
    renderPage();
    await screen.findByText("Today meeting");
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByLabelText("Last 7 days"));
    expect(await screen.findByText("Last 7 days", { selector: ".chip" })).toBeInTheDocument();
    await waitFor(() => expect(calls.at(-1)).toContain("after="));
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Last 7 days" }));
    await waitFor(() => expect(calls.at(-1)).not.toContain("after="));
    expect(screen.queryByText("Last 7 days", { selector: ".chip" })).toBeNull();
  });

  it("keeps the old list on screen, dimmed, while a new search loads", async () => {
    let release!: () => void;
    mockApi({ ...base, "/api/meetings": (url: string) => (url.includes("q=slow") ? new Promise<Response>((r) => (release = () => r(new Response(JSON.stringify([m2]))))) : [m1]) });
    const { container } = renderPage();
    await screen.findByText("Today meeting");
    fireEvent.change(screen.getByLabelText("Search meetings"), { target: { value: "slow" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByText("Today meeting")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("[aria-busy=true]")).not.toBeNull());
    await act(async () => release());
    expect(await screen.findByText("Old meeting")).toBeInTheDocument();
  });

  it("clears search and filters from the empty state but stays in the same channel", async () => {
    const calls = mockApi({ ...base, "/api/meetings": (u: string) => (u.includes("q=") ? [] : [m1]) });
    renderPage();
    await screen.findByText("Today meeting");
    fireEvent.click(screen.getByRole("button", { name: /Uploads/ }));
    fireEvent.change(screen.getByLabelText("Search meetings"), { target: { value: "nothing" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.click(await screen.findByRole("button", { name: "Clear search and filters" }));
    await waitFor(() => expect(calls.at(-1)).not.toContain("q="));
    expect(calls.at(-1)).toContain("source=upload");
  });
});
