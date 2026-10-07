import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionItems } from "@/components/ActionItems";
import { NotesPanel } from "@/components/NotesPanel";
import { ToastProvider } from "@/components/Toast";
import { groupByAssignee, notesToText, openCount, ringDash } from "@/lib/notes";
import { item, items, meeting, mockApi, summary } from "./helpers/fixtures";

describe("notes helpers", () => {
  it("groups action items by person in order of appearance, Unassigned last", () => {
    expect(groupByAssignee(items).map(([who, g]) => [who, g.map((i) => i.id)])).toEqual([["Maya Chen", [1, 4]], ["Vishrut Grover", [3]], ["Unassigned", [2]]]);
    expect(groupByAssignee([item({ id: 9, assignee: null }), item({ id: 10 })]).map(([who]) => who)).toEqual(["Maya Chen", "Unassigned"]);
    expect(groupByAssignee([])).toEqual([]);
  });

  it("counts open items", () => {
    expect(openCount(items)).toBe(3);
    expect(openCount([])).toBe(0);
  });

  it.each([[0, "0.00"], [50, "28.27"], [100, "56.55"], [-20, "0.00"], [250, "56.55"]])("ring for %s%% fills %s", (pct, filled) => {
    expect(ringDash(pct).split(" ")[0]).toBe(filled);
  });

  it("turns notes into plain text", () => {
    expect(notesToText("Title", "Overview.", summary.sections)).toBe(
      "Title\n\nOverview.\n\nLaunch plan\n- Ship on Friday\n- Budget is tight\n\nNext steps\n- Write the announcement");
    expect(notesToText("T", "", [])).toBe("T");
  });
});

describe("ActionItems", () => {
  const participants = meeting().participants;
  const setup = (list = items, over: Partial<React.ComponentProps<typeof ActionItems>> = {}) => {
    const props = { meetingId: 1, items: list, participants, onSeek: vi.fn(), onChange: vi.fn(), ...over };
    render(<ToastProvider><ActionItems {...props} /></ToastProvider>);
    return props;
  };
  const sent = (calls: { requests?: unknown[] }) => calls.requests;

  it("groups items under each person and says how many are left", () => {
    setup();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Maya Chen", "Vishrut Grover", "Unassigned"]);
    expect(screen.getByText(/This call has/)).toHaveTextContent("This call has 3 to dos left.");
  });

  it.each([[[], "No action items yet."], [[item({ is_done: true })], "All done. Nothing left to do."], [[item()], "This call has 1 to do left."]])("banner for %j", (list, text) => {
    setup(list as never);
    expect(screen.getByRole("region", { name: "Action items" })).toHaveTextContent(text);
  });

  it("ticking an item saves it and refreshes", async () => {
    const calls = mockApi({ "/api/action-items/1": item({ is_done: true }) });
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText('Mark "Draft the copy" done'));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(sent(calls)).toEqual([{ method: "PATCH", path: "/api/action-items/1", body: { is_done: true } }]);
  });

  it("a tick shows at once, before the server has answered", async () => {
    let answer!: () => void;
    mockApi({ "/api/action-items/1": () => new Promise<Response>((r) => (answer = () => r(new Response(JSON.stringify(item({ is_done: true })))))) });
    setup();
    const box = screen.getByLabelText('Mark "Draft the copy" done');
    fireEvent.click(box);
    expect(screen.getByLabelText('Mark "Draft the copy" not done')).toBeChecked(); // instantly, with no reply yet
    await act(async () => answer());
  });

  it("a failed tick is put back and the error is shown", async () => {
    mockApi({ "/api/action-items/1": new Response(JSON.stringify({ detail: "Action item not found" }), { status: 404 }) });
    setup();
    fireEvent.click(screen.getByLabelText('Mark "Draft the copy" done'));
    expect(await screen.findByText("Action item not found")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Mark "Draft the copy" done')).not.toBeChecked());
  });

  it("a newer value from the server wins over an earlier tick", async () => {
    mockApi({ "/api/action-items/1": item() });
    const props = { meetingId: 1, items, participants, onSeek: vi.fn(), onChange: vi.fn() };
    const { rerender } = render(<ToastProvider><ActionItems {...props} /></ToastProvider>);
    fireEvent.click(screen.getAllByLabelText('Mark "Draft the copy" done')[0]);
    await waitFor(() => expect(props.onChange).toHaveBeenCalled());
    // someone else un-did it and the list was refreshed: the server now says done=true, then false again
    rerender(<ToastProvider><ActionItems {...props} items={items.map((i) => (i.id === 1 ? { ...i, is_done: true } : i))} /></ToastProvider>);
    expect(screen.getByLabelText('Mark "Draft the copy" not done')).toBeChecked();
    rerender(<ToastProvider><ActionItems {...props} items={items.map((i) => ({ ...i }))} /></ToastProvider>); // reloaded: not done again
    expect(screen.getByLabelText('Mark "Draft the copy" done')).not.toBeChecked(); // not stuck on the old tick
  });

  it("unticking sends false", async () => {
    const calls = mockApi({ "/api/action-items/3": item() });
    setup();
    fireEvent.click(screen.getByLabelText('Mark "Send the invite" not done'));
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    expect(sent(calls)![0]).toMatchObject({ body: { is_done: false } });
  });

  it("clicking the text edits it; Enter saves the trimmed text", async () => {
    const calls = mockApi({ "/api/action-items/1": item() });
    const { onChange } = setup();
    fireEvent.click(screen.getByText("Draft the copy"));
    const input = screen.getByLabelText("Edit action item");
    fireEvent.change(input, { target: { value: "  Draft the new copy  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(sent(calls)![0]).toMatchObject({ method: "PATCH", body: { text: "Draft the new copy" } });
    expect(screen.queryByLabelText("Edit action item")).toBeNull();
  });

  it("Escape, blank text and unchanged text send nothing", async () => {
    const calls = mockApi({});
    setup();
    fireEvent.click(screen.getByText("Draft the copy"));
    fireEvent.change(screen.getByLabelText("Edit action item"), { target: { value: "changed" } });
    fireEvent.keyDown(screen.getByLabelText("Edit action item"), { key: "Escape" });
    fireEvent.click(screen.getByText("Draft the copy"));
    fireEvent.change(screen.getByLabelText("Edit action item"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByLabelText("Edit action item"), { key: "Enter" });
    fireEvent.click(screen.getByText("Draft the copy"));
    fireEvent.keyDown(screen.getByLabelText("Edit action item"), { key: "Enter" });
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });

  it("leaving the field saves the change", async () => {
    const calls = mockApi({ "/api/action-items/2": item() });
    setup();
    fireEvent.click(screen.getByText("Book a room"));
    fireEvent.change(screen.getByLabelText("Edit action item"), { target: { value: "Book the big room" } });
    fireEvent.blur(screen.getByLabelText("Edit action item"));
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
  });

  it("reassigns to a person or back to nobody", async () => {
    const calls = mockApi({ "/api/action-items/1": item() });
    setup();
    fireEvent.change(screen.getByLabelText('Assignee of "Draft the copy"'), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText('Assignee of "Draft the copy"'), { target: { value: "" } });
    await waitFor(() => expect(sent(calls)).toHaveLength(2));
    expect(sent(calls)!.map((r) => (r as { body: unknown }).body)).toEqual([{ assignee_id: 1 }, { assignee_id: null }]);
  });

  it("deletes an item", async () => {
    const calls = mockApi({ "/api/action-items/2": new Response(null, { status: 204 }) });
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText('Delete "Book a room"'));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(sent(calls)![0]).toMatchObject({ method: "DELETE", path: "/api/action-items/2" });
  });

  it("the moment links jump the player, and items without a time have none", () => {
    const { onSeek } = setup();
    fireEvent.click(screen.getAllByTitle("Jump to this moment")[0]);
    expect(onSeek).toHaveBeenCalledWith(83);
    expect(screen.getAllByTitle("Jump to this moment")).toHaveLength(3); // "Book a room" has no time
  });

  it("adds an item with an owner, trims it and clears the box", async () => {
    const calls = mockApi({ "/api/meetings/1/action-items": item() });
    const { onChange } = setup();
    const add = screen.getByRole("button", { name: /Add/ });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New action item"), { target: { value: "  Call the vendor " } });
    fireEvent.change(screen.getByLabelText("Assign to"), { target: { value: "2" } });
    fireEvent.click(add);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(sent(calls)![0]).toMatchObject({ method: "POST", body: { text: "Call the vendor", assignee_id: 2 } });
    expect(screen.getByLabelText("New action item")).toHaveValue("");
  });

  it("a blank new item is not sent", async () => {
    const calls = mockApi({});
    setup();
    fireEvent.change(screen.getByLabelText("New action item"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /Add/ })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("New action item").closest("form")!);
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });

  it("shows the server's message and keeps what was typed when saving fails", async () => {
    mockApi({ "/api/meetings/1/action-items": new Response(JSON.stringify({ detail: "Assignee must be a participant of this meeting" }), { status: 400 }) });
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("New action item"), { target: { value: "Call" } });
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    expect(await screen.findByText("Assignee must be a participant of this meeting")).toBeInTheDocument();
    expect(screen.getByLabelText("New action item")).toHaveValue("Call");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a failed tick reports the error and does not refresh", async () => {
    mockApi({ "/api/action-items/1": new Response(JSON.stringify({ detail: "Action item not found" }), { status: 404 }) });
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText('Mark "Draft the copy" done'));
    expect(await screen.findByText("Action item not found")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("NotesPanel", () => {
  const routes = { "/api/meetings/1/summary": summary };
  const setup = (over: Record<string, unknown> = {}, props: Partial<React.ComponentProps<typeof NotesPanel>> = {}) => {
    const calls = mockApi({ ...routes, "/api/meetings/1/action-items": [], ...over });
    const p = { meeting: meeting(), items: [], onItemsChanged: vi.fn(), onSeek: vi.fn(), ...props };
    const { container } = render(<ToastProvider><NotesPanel {...p} /></ToastProvider>);
    return { calls, container, ...p };
  };
  const loaded = () => screen.findByText("They agreed to ship on Friday.");

  beforeEach(() => vi.restoreAllMocks());

  it("shows the summary, keywords and every section with its moments", async () => {
    setup();
    await loaded();
    expect(screen.getByText("launch", { selector: ".chip" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Launch plan" })).toBeInTheDocument();
    expect(screen.getByText("Ship on Friday")).toBeInTheDocument();
    expect(screen.getAllByTitle("Jump to this moment")).toHaveLength(2); // the bullet without a time has no link
  });

  it("clicking a moment seeks the player", async () => {
    const { onSeek } = setup();
    await loaded();
    fireEvent.click(screen.getByText("(01:05)"));
    expect(onSeek).toHaveBeenCalledWith(65);
  });

  it("shows a placeholder while loading and a message on failure", async () => {
    const { container } = setup();
    expect(container.querySelector(".skeleton")).not.toBeNull();
    await loaded();
    vi.restoreAllMocks();
    mockApi({ "/api/meetings/1/summary": new Response(JSON.stringify({ detail: "Meeting not found" }), { status: 404 }), "/api/meetings/1/action-items": [] });
    render(<ToastProvider><NotesPanel meeting={meeting()} items={[]} onItemsChanged={vi.fn()} onSeek={vi.fn()} /></ToastProvider>);
    expect(await screen.findByText("Meeting not found")).toBeInTheDocument();
  });

  it("copes with a meeting that has no notes at all", async () => {
    setup({ "/api/meetings/1/summary": { overview: "", keywords: [], sections: [] } });
    expect(await screen.findByText("No summary yet.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Notes" })).toBeNull();
  });

  describe("editing", () => {
    it("saves only what changed, then refreshes", async () => {
      const { calls } = setup({ "/api/meetings/1/summary": () => summary, "/api/note-bullets/": { id: 11 } });
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
      fireEvent.change(screen.getByLabelText("Summary text"), { target: { value: "A new overview." } });
      fireEvent.change(screen.getByLabelText("Note: Ship on Friday"), { target: { value: "Ship on Thursday" } });
      fireEvent.click(screen.getByRole("button", { name: /Save/ }));
      expect(await screen.findByText("Notes saved")).toBeInTheDocument();
      const writes = calls.requests!.filter((r) => r.method === "PATCH");
      expect(writes.map((w) => [w.path, w.body])).toEqual([["/api/meetings/1/summary", { overview: "A new overview." }], ["/api/note-bullets/11", { text: "Ship on Thursday" }]]);
    });

    it("saving without changes sends nothing", async () => {
      const { calls } = setup();
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
      fireEvent.click(screen.getByRole("button", { name: /Save/ }));
      await screen.findByText("Notes saved");
      expect(calls.requests!.filter((r) => r.method === "PATCH")).toHaveLength(0);
    });

    it("cancel throws the changes away", async () => {
      const { calls } = setup();
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
      fireEvent.change(screen.getByLabelText("Summary text"), { target: { value: "scrap this" } });
      fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
      expect(screen.getByText("They agreed to ship on Friday.")).toBeInTheDocument();
      expect(calls.requests!.filter((r) => r.method === "PATCH")).toHaveLength(0);
    });

    it("a failed save explains why and stays in edit mode", async () => {
      setup({ "/api/meetings/1/summary": () => summary });
      await loaded();
      vi.restoreAllMocks();
      mockApi({ "/api/meetings/1/summary": new Response(JSON.stringify({ detail: "Too long" }), { status: 422 }) });
      fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
      fireEvent.change(screen.getByLabelText("Summary text"), { target: { value: "x" } });
      fireEvent.click(screen.getByRole("button", { name: /Save/ }));
      expect(await screen.findByText("Too long")).toBeInTheDocument();
      expect(screen.getByLabelText("Summary text")).toBeInTheDocument();
    });
  });

  describe("regenerate", () => {
    it("rewrites the notes and refreshes the tasks", async () => {
      const { onItemsChanged } = setup({ "/api/meetings/1/summary/regenerate": { ...summary, ai: { provider: "mock", model: "heuristic", status: "ok", error: null } } });
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
      expect(await screen.findByText("Notes rewritten (mock)")).toBeInTheDocument();
      expect(onItemsChanged).toHaveBeenCalled();
    });

    it("says so when the AI provider failed and the built-in notes were used", async () => {
      setup({ "/api/meetings/1/summary/regenerate": { ...summary, ai: { provider: "anthropic", model: "x", status: "fallback", error: "HTTP 500" } } });
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
      expect(await screen.findByText(/built-in notes were used/)).toBeInTheDocument();
    });

    it("shows an error if the request itself fails", async () => {
      setup({ "/api/meetings/1/summary/regenerate": new Response(JSON.stringify({ detail: "Provider 'x' is not available" }), { status: 400 }) });
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
      expect(await screen.findByText("Provider 'x' is not available")).toBeInTheDocument();
    });
  });

  describe("copy and rating", () => {
    it("copies the notes as text", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      setup();
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: "Copy notes" }));
      await screen.findByText("Notes copied");
      expect(writeText.mock.calls[0][0]).toContain("- Ship on Friday");
    });

    it("tells the user when the browser blocks copying", async () => {
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
      setup();
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: "Copy notes" }));
      expect(await screen.findByText(/browser blocked it/)).toBeInTheDocument();
    });

    it("remembers the star rating for the visit", async () => {
      setup();
      await loaded();
      fireEvent.click(screen.getByRole("button", { name: "4 stars" }));
      expect(screen.getByRole("button", { name: "4 stars" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "2 stars" })).toHaveAttribute("aria-pressed", "false");
      expect(within(screen.getByRole("status")).getByText("Thanks for the feedback")).toBeInTheDocument();
    });
  });
});
