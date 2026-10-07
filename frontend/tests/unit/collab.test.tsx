import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportModal } from "@/components/ExportModal";
import { BookmarksPanel } from "@/components/panels/BookmarksPanel";
import { CommentsPanel } from "@/components/panels/CommentsPanel";
import { SoundbitesPanel } from "@/components/panels/SoundbitesPanel";
import { ToastProvider } from "@/components/Toast";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { download } from "@/lib/download";
import { bookmarks, comments, fakePlayer, line, mockApi, soundbites, transcript } from "./helpers/fixtures";

vi.mock("@/lib/download", () => ({ download: vi.fn() }));
const wrap = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);
beforeEach(() => {
  vi.mocked(download).mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SoundbitesPanel", () => {
  const setup = (over: Partial<React.ComponentProps<typeof SoundbitesPanel>> = {}, routes: Record<string, unknown> = {}) => {
    const calls = mockApi({ "/api/meetings/1/soundbites": soundbites, ...routes });
    const props = { meetingId: 1, duration: 120, time: 30, draft: null, onDraftDone: vi.fn(), onPlay: vi.fn(), onSeek: vi.fn(), ...over };
    wrap(<SoundbitesPanel {...props} />);
    return { calls, ...props };
  };

  it("lists clips with times and excerpts, plays a range and jumps to the start", async () => {
    const { onPlay, onSeek } = setup();
    expect(await screen.findByText("Welcome overview")).toBeInTheDocument();
    expect(screen.getByText("Soundbites · 2")).toBeInTheDocument();
    expect(screen.getByText("Thanks for joining everyone.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Play "Welcome overview"' }));
    expect(onPlay).toHaveBeenCalledWith(4, 18);
    fireEvent.click(screen.getAllByTitle("Jump to the start")[1]);
    expect(onSeek).toHaveBeenCalledWith(65);
  });

  it("explains an empty list", async () => {
    setup({}, { "/api/meetings/1/soundbites": [] });
    expect(await screen.findByText(/No soundbites yet/)).toBeInTheDocument();
  });

  it("a line chosen in the transcript opens the form already filled in", async () => {
    setup({ draft: { id: 1, start: 20, end: 25 } });
    await screen.findByText("Welcome overview");
    expect(screen.getByLabelText("Start time")).toHaveValue("00:20");
    expect(screen.getByLabelText("End time")).toHaveValue("00:25");
  });

  it("the + button starts at the current time and runs 15 seconds, but never past the end", async () => {
    setup({ time: 112, duration: 120 });
    await screen.findByText("Welcome overview");
    fireEvent.click(screen.getByRole("button", { name: "New soundbite" }));
    expect(screen.getByLabelText("Start time")).toHaveValue("01:52");
    expect(screen.getByLabelText("End time")).toHaveValue("02:00");
  });

  it("saves a clip as seconds and closes the form", async () => {
    const { calls } = setup({ draft: { id: 1, start: 20, end: 25 } }, { "/api/meetings/1/soundbites": (u: string) => (u === "/api/meetings/1/soundbites" ? soundbites : soundbites) });
    await screen.findByText("Welcome overview");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Budget worry " } });
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "0:27.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Soundbite saved")).toBeInTheDocument();
    expect(calls.requests!.find((r) => r.method === "POST")).toMatchObject({ body: { title: "Budget worry", start_sec: 20, end_sec: 27.5 } });
  });

  it("closing the form clears the transcript line it came from, after saving and after Cancel", async () => {
    const { onDraftDone } = setup({ draft: { id: 1, start: 20, end: 25 } });
    await screen.findByText("Welcome overview");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDraftDone).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDraftDone).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["", "00:10", "00:20", /Give the soundbite a title/],
    ["T", "abc", "00:20", /Times look like/],
    ["T", "00:20", "00:10", /end must be after the start/],
    ["T", "00:20", "00:20", /end must be after the start/],
    ["T", "00:10", "05:00", /only 02:00 long/],
  ])("refuses title %j, %s to %s before sending", async (title, start, end, message) => {
    const { calls } = setup({ draft: { id: 1, start: 10, end: 20 } });
    await screen.findByText("Welcome overview");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: start } });
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: end } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(calls.requests!.filter((r) => r.method === "POST")).toHaveLength(0);
  });

  it("'Start = now' and 'End = now' take the playing time", async () => {
    setup({ time: 47, draft: { id: 1, start: 1, end: 2 } });
    await screen.findByText("Welcome overview");
    fireEvent.click(screen.getByRole("button", { name: "Start = now" }));
    fireEvent.click(screen.getByRole("button", { name: "End = now" }));
    expect(screen.getByLabelText("Start time")).toHaveValue("00:47");
    expect(screen.getByLabelText("End time")).toHaveValue("00:47");
  });

  it("shows the server's message when saving fails and keeps the form", async () => {
    setup({ draft: { id: 1, start: 10, end: 20 } }, { "/api/meetings/1/soundbites": soundbites });
    await screen.findByText("Welcome overview");
    vi.restoreAllMocks();
    mockApi({ "/api/meetings/1/soundbites": new Response(JSON.stringify({ detail: "A soundbite cannot run past the end of the meeting" }), { status: 422 }) });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("A soundbite cannot run past the end of the meeting")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });

  it("renames in place with Enter, cancels with Escape", async () => {
    const { calls } = setup({}, { "/api/soundbites/1": soundbites[0] });
    await screen.findByText("Welcome overview");
    fireEvent.click(screen.getByRole("button", { name: 'Rename "Welcome overview"' }));
    fireEvent.change(screen.getByLabelText("Soundbite title"), { target: { value: "Intro" } });
    fireEvent.keyDown(screen.getByLabelText("Soundbite title"), { key: "Enter" });
    await waitFor(() => expect(calls.requests!.find((r) => r.method === "PATCH")).toMatchObject({ path: "/api/soundbites/1", body: { title: "Intro" } }));
    fireEvent.click(screen.getByRole("button", { name: 'Rename "The decision"' }));
    fireEvent.change(screen.getByLabelText("Soundbite title"), { target: { value: "ignored" } });
    fireEvent.keyDown(screen.getByLabelText("Soundbite title"), { key: "Escape" });
    expect(calls.requests!.filter((r) => r.method === "PATCH")).toHaveLength(1);
  });

  it("deletes a clip", async () => {
    const { calls } = setup({}, { "/api/soundbites/2": new Response(null, { status: 204 }) });
    await screen.findByText("The decision");
    fireEvent.click(screen.getByRole("button", { name: 'Delete "The decision"' }));
    await waitFor(() => expect(calls.requests!.find((r) => r.method === "DELETE")).toMatchObject({ path: "/api/soundbites/2" }));
  });
});

describe("CommentsPanel", () => {
  const setup = (over: Partial<React.ComponentProps<typeof CommentsPanel>> = {}, routes: Record<string, unknown> = {}) => {
    const calls = mockApi({ "/api/meetings/1/comments": comments, ...routes });
    const props = { meetingId: 1, lines: transcript, time: 12, target: null, onTargetChange: vi.fn(), onSeek: vi.fn(), onChanged: vi.fn(), ...over };
    wrap(<CommentsPanel {...props} />);
    return { calls, ...props };
  };

  it("lists comments with the line they are about, and a click jumps there", async () => {
    const { onSeek } = setup();
    expect(await screen.findByText("Can we get numbers?")).toBeInTheDocument();
    expect(screen.getByText("Comments · 2")).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle("Jump to this line")[0]);
    expect(onSeek).toHaveBeenCalledWith(10);
    expect(screen.getByText(/x{89}…/)).toBeInTheDocument(); // a long quote is shortened
  });

  it("comments on the line playing now unless another was chosen", async () => {
    const { rerender } = render(<div />);
    rerender(<div />);
    setup({ time: 22 });
    await screen.findByText("Can we get numbers?");
    expect(screen.getByLabelText("Commenting on")).toHaveTextContent("00:20");
  });

  it("shows the chosen line, and the x goes back to the playing one", async () => {
    const { onTargetChange } = setup({ target: 5 });
    await screen.findByText("Can we get numbers?");
    expect(screen.getByLabelText("Commenting on")).toHaveTextContent("00:40");
    fireEvent.click(screen.getByRole("button", { name: "Use the line playing now" }));
    expect(onTargetChange).toHaveBeenCalledWith(null);
  });

  it("posts against that line, clears the box and refreshes the transcript counts", async () => {
    const { calls, onChanged, onTargetChange } = setup({ target: 3 }, { "/api/meetings/1/comments": comments });
    await screen.findByText("Can we get numbers?");
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "  Good point  " } });
    fireEvent.click(screen.getByRole("button", { name: /^Comment$/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls.requests!.find((r) => r.method === "POST")).toMatchObject({ body: { segment_id: 3, body: "Good point" } });
    expect(screen.getByLabelText("Comment")).toHaveValue("");
    expect(onTargetChange).toHaveBeenCalledWith(null);
  });

  it("Enter sends, Shift+Enter makes a new line, blank is not sent", async () => {
    const { calls } = setup();
    await screen.findByText("Can we get numbers?");
    const box = screen.getByLabelText("Comment");
    expect(screen.getByRole("button", { name: /Comment$/ })).toBeDisabled();
    fireEvent.change(box, { target: { value: "one" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(calls.requests!.filter((r) => r.method === "POST")).toHaveLength(0);
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(calls.requests!.filter((r) => r.method === "POST")).toHaveLength(1));
  });

  it("deletes a comment and refreshes the counts", async () => {
    const { calls, onChanged } = setup({}, { "/api/comments/1": new Response(null, { status: 204 }) });
    await screen.findByText("Can we get numbers?");
    fireEvent.click(screen.getAllByRole("button", { name: "Delete comment" })[0]);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls.requests!.find((r) => r.method === "DELETE")).toMatchObject({ path: "/api/comments/1" });
  });

  it("reports a failed post and keeps the text", async () => {
    setup({ target: 3 }, { "/api/meetings/1/comments": () => new Response(JSON.stringify({ detail: "That line is not part of this meeting" }), { status: 400 }) });
    fireEvent.change(await screen.findByLabelText("Comment"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /^Comment$/ }));
    expect(await screen.findByText("That line is not part of this meeting")).toBeInTheDocument();
    expect(screen.getByLabelText("Comment")).toHaveValue("x");
  });

  it("explains an empty thread and survives an empty transcript", async () => {
    setup({ lines: [] }, { "/api/meetings/1/comments": [] });
    expect(await screen.findByText(/No comments yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Commenting on")).toBeNull();
  });
});

describe("BookmarksPanel", () => {
  const setup = (over: Partial<React.ComponentProps<typeof BookmarksPanel>> = {}, routes: Record<string, unknown> = {}) => {
    const calls = mockApi(routes);
    const props = { meetingId: 1, bookmarks, time: 75, onSeek: vi.fn(), onChanged: vi.fn(), ...over };
    wrap(<BookmarksPanel {...props} />);
    return { calls, ...props };
  };

  it("lists moments and jumps to one", () => {
    const { onSeek } = setup();
    expect(screen.getByText("Bookmarks · 2")).toBeInTheDocument();
    expect(screen.getByText("revisit this")).toBeInTheDocument();
    fireEvent.click(screen.getByText("00:42"));
    expect(onSeek).toHaveBeenCalledWith(42);
  });

  it("bookmarks the current time with an optional note", async () => {
    const { calls, onChanged } = setup({}, { "/api/meetings/1/bookmarks": bookmarks[0] });
    fireEvent.click(screen.getByRole("button", { name: "Bookmark 01:15" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls.requests![0]).toMatchObject({ method: "POST", body: { time_sec: 75, note: "" } });
    fireEvent.change(screen.getByLabelText("Bookmark note"), { target: { value: " big idea " } });
    fireEvent.click(screen.getByRole("button", { name: "Bookmark 01:15" }));
    await waitFor(() => expect(calls.requests).toHaveLength(2));
    expect(calls.requests![1].body).toMatchObject({ note: "big idea" });
    await waitFor(() => expect(screen.getByLabelText("Bookmark note")).toHaveValue("")); // cleared once the save has finished
  });

  it("deletes one and explains an empty list", async () => {
    const { calls, onChanged } = setup({}, { "/api/bookmarks/2": new Response(null, { status: 204 }) });
    fireEvent.click(screen.getByRole("button", { name: "Delete bookmark at 01:30" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls.requests![0]).toMatchObject({ method: "DELETE", path: "/api/bookmarks/2" });
  });

  it("says so when there are none, and when saving fails", async () => {
    setup({ bookmarks: [] }, { "/api/meetings/1/bookmarks": new Response(JSON.stringify({ detail: "That moment is past the end of the meeting" }), { status: 422 }) });
    expect(screen.getByText(/No bookmarks yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bookmark/ }));
    expect(await screen.findByText("That moment is past the end of the meeting")).toBeInTheDocument();
  });
});

describe("ExportModal", () => {
  const open = () => wrap(<ExportModal meetingId={4} open onClose={vi.fn()} />);
  const go = () => fireEvent.click(screen.getByRole("button", { name: /Download/ }));
  const downloaded = () => new URL(vi.mocked(download).mock.calls[0][0]);

  it("offers every transcript format and downloads the default PDF with both options on", () => {
    open();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["PDF", "MD", "TXT", "JSON", "SRT", "CSV"]);
    go();
    const u = downloaded();
    expect(u.pathname).toBe("/api/meetings/4/export");
    expect(Object.fromEntries(u.searchParams)).toEqual({ what: "transcript", format: "pdf", timestamps: "true", speakers: "true" });
  });

  it("sends the chosen format and options", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: "CSV" }));
    fireEvent.click(screen.getByLabelText("Include timestamps"));
    fireEvent.click(screen.getByLabelText("Show speaker names"));
    go();
    expect(Object.fromEntries(downloaded().searchParams)).toEqual({ what: "transcript", format: "csv", timestamps: "false", speakers: "false" });
  });

  it("the summary has three formats and no speaker option", () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["PDF", "MD", "JSON"]);
    expect(screen.queryByLabelText("Show speaker names")).toBeNull();
    go();
    const params = Object.fromEntries(downloaded().searchParams);
    expect(params).toMatchObject({ what: "summary", format: "pdf" });
    expect(params).not.toHaveProperty("speakers");
  });

  it("falls back to PDF when the chosen format does not exist for the other content", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: "SRT" }));
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(screen.getByRole("radio", { name: "PDF" })).toHaveAttribute("aria-checked", "true");
  });

  it("SRT always has timestamps, so that option is switched off", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: "SRT" }));
    expect(screen.getByLabelText(/Include timestamps/)).toBeDisabled();
    expect(screen.getByText("(always in SRT)")).toBeInTheDocument();
  });

  it("closes after starting the download", () => {
    const onClose = vi.fn();
    wrap(<ExportModal meetingId={4} open onClose={onClose} />);
    go();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("transcript line actions", () => {
  const render_ = (props: Partial<React.ComponentProps<typeof TranscriptPanel>> = {}) =>
    render(<TranscriptPanel meetingId={1} lines={[line(1, 0, "A line"), { ...line(2, 10, "Another"), comment_count: 2 }]} loading={false} player={fakePlayer()} {...props} />);

  it("offers comment and soundbite buttons that pass the line along", () => {
    const onComment = vi.fn(), onSoundbite = vi.fn();
    render_({ onComment, onSoundbite });
    fireEvent.click(screen.getByRole("button", { name: "Comment on 00:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Make a soundbite from 00:10" }));
    expect(onComment).toHaveBeenCalledWith(1);
    expect(onSoundbite).toHaveBeenCalledWith(10, 15);
  });

  it("shows how many comments a line has and opens them", () => {
    const onComment = vi.fn();
    render_({ onComment });
    fireEvent.click(screen.getByRole("button", { name: "2 comments, open" }));
    expect(onComment).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("button", { name: /1 comment/ })).toBeNull(); // the other line has none
  });

  it("has no action buttons when nothing handles them", () => {
    render_();
    expect(screen.queryByRole("button", { name: /Comment on/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /soundbite/ })).toBeNull();
  });
});

describe("download helper", () => {
  it("clicks a temporary link and removes it", async () => {
    const { download: real } = await vi.importActual<typeof import("@/lib/download")>("@/lib/download");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    real("http://x/y.pdf");
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[href='http://x/y.pdf']")).toBeNull();
  });
});

