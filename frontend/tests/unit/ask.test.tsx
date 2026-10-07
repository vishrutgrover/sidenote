import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AskPanel } from "@/components/AskPanel";
import { ToastProvider } from "@/components/Toast";
import { botMsg, llm, mockApi, userMsg } from "./helpers/fixtures";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });

const ASKED = { user: userMsg(9, "q"), assistant: botMsg(10, "a"), ai: { provider: "mock", model: "heuristic", status: "ok", error: null } };
function setup(opts: { meetingId?: number | null; history?: unknown; ask?: unknown; onSeek?: (s: number) => void } = {}) {
  const meetingId = opts.meetingId === undefined ? 1 : opts.meetingId;
  const base = meetingId === null ? "/api" : `/api/meetings/${meetingId}`;
  let history = opts.history ?? [];
  const calls = mockApi({
    [`${base}/chat`]: () => history,
    [`${base}/ask`]: () => { history = [userMsg(1, "q"), botMsg(2, "answer text")]; return opts.ask ?? ASKED; },
    "/api/llm/models": llm,
  });
  const onSeek = opts.onSeek ?? vi.fn();
  render(<ToastProvider><AskPanel meetingId={meetingId} onSeek={meetingId === null ? undefined : onSeek} /></ToastProvider>);
  return { calls, onSeek, base };
}
const box = () => screen.getByLabelText("Question");
const posts = (calls: { requests?: { method: string; path: string; body: unknown }[] }) => calls.requests!.filter((r) => r.method === "POST");

describe("AskPanel", () => {
  it("greets with suggestions when there is no chat yet, and a suggestion asks straight away", async () => {
    const { calls, base } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "What are the action items?" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toMatchObject({ path: `${base}/ask`, body: { question: "What are the action items?" } });
  });

  it("shows the question at once with a Thinking… line, then the answer from history", async () => {
    let finish!: () => void;
    const calls = mockApi({
      "/api/meetings/1/chat": () => [],
      "/api/meetings/1/ask": () => new Promise<Response>((r) => (finish = () => r(new Response(JSON.stringify(ASKED))))),
      "/api/llm/models": llm,
    });
    render(<ToastProvider><AskPanel meetingId={1} onSeek={vi.fn()} /></ToastProvider>);
    fireEvent.change(box(), { target: { value: "  Who owns launch? " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Who owns launch?")).toBeInTheDocument();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(box()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await act(async () => finish());
    expect(calls.requests!.filter((r) => r.method === "POST")[0].body).toMatchObject({ question: "Who owns launch?" });
    await waitFor(() => expect(screen.queryByText("Thinking…")).toBeNull());
  });

  it("Enter sends, Shift+Enter does not, and blank questions are not sent", async () => {
    const { calls } = setup();
    await screen.findByText(/Ask anything/);
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.change(box(), { target: { value: "real question" } });
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    expect(posts(calls)).toHaveLength(0);
    fireEvent.keyDown(box(), { key: "Enter" });
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
  });

  it("gives the question back and shows the message when asking fails", async () => {
    mockApi({
      "/api/meetings/1/chat": () => [],
      "/api/meetings/1/ask": () => new Response(JSON.stringify({ detail: "Provider 'openai' is not available" }), { status: 400 }),
      "/api/llm/models": llm,
    });
    render(<ToastProvider><AskPanel meetingId={1} onSeek={vi.fn()} /></ToastProvider>);
    fireEvent.change(box(), { target: { value: "Will this fail?" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(await screen.findByText("Provider 'openai' is not available")).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue("Will this fail?"));
    expect(screen.queryByText("Thinking…")).toBeNull();
  });

  it("renders bullets, and a citation jumps to that moment in this meeting", async () => {
    const { onSeek } = setup({ history: [userMsg(1, "q"), botMsg(2, "Here is what I found:\n- It moves to next sprint [01:48]\n- Maya agreed [02:05]")] });
    await screen.findByText("Here is what I found:");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "01:48" }));
    expect(onSeek).toHaveBeenCalledWith(108);
  });

  it("source chips jump within a meeting", async () => {
    const sources = [{ meeting_id: 1, meeting_title: "Weekly Sync", segment_id: 5, start_sec: 49.6, speaker: "Maya Chen" }];
    const { onSeek } = setup({ history: [userMsg(1, "q"), botMsg(2, "ok", { sources })] });
    fireEvent.click(await screen.findByRole("button", { name: "00:49 Maya Chen" }));
    expect(onSeek).toHaveBeenCalledWith(49.6);
  });

  it("in the all-meetings chat, sources link to the meeting at that time and citations are plain text", async () => {
    const sources = [{ meeting_id: 4, meeting_title: "Engineering Standup", segment_id: 9, start_sec: 19.4, speaker: "Liam" }];
    setup({ meetingId: null, history: [userMsg(1, "q", null), botMsg(2, "Liam is stuck [00:19]", { meeting_id: null, sources })] });
    const link = await screen.findByRole("link", { name: "Engineering Standup · 00:19" });
    expect(link).toHaveAttribute("href", "/view/4?t=19");
    expect(screen.queryByRole("button", { name: "00:19" })).toBeNull();
  });

  it("says who wrote each answer", async () => {
    setup({ history: [userMsg(1, "a"), botMsg(2, "from builtin"), userMsg(3, "b"), botMsg(4, "from claude", { provider: "anthropic", model: "claude-opus-5-5" })] });
    expect(await screen.findByText("Built-in answer")).toBeInTheDocument();
    expect(screen.getByText("anthropic · claude-opus-5-5")).toBeInTheDocument();
  });

  it("copies an answer, or says the browser blocked it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setup({ history: [userMsg(1, "q"), botMsg(2, "the answer")] });
    fireEvent.click(await screen.findByRole("button", { name: "Copy answer" }));
    await screen.findByText("Answer copied");
    expect(writeText).toHaveBeenCalledWith("the answer");
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    fireEvent.click(screen.getByRole("button", { name: "Copy answer" }));
    expect(await screen.findByText(/browser blocked it/)).toBeInTheDocument();
  });

  it("New chat clears the history", async () => {
    let cleared = false;
    const calls = mockApi({
      "/api/meetings/1/chat": (_: string, init?: RequestInit) => {
        if (init?.method === "DELETE") { cleared = true; return new Response(null, { status: 204 }); }
        return cleared ? [] : [userMsg(1, "q"), botMsg(2, "a")];
      },
      "/api/llm/models": llm,
    });
    render(<ToastProvider><AskPanel meetingId={1} onSeek={vi.fn()} /></ToastProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /New chat/ }));
    expect(await screen.findByText("Started a new chat")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: /New chat/ })).toBeNull());
    expect(calls.requests!.some((r) => r.method === "DELETE" && r.path === "/api/meetings/1/chat")).toBe(true);
  });

  describe("model picker", () => {
    it("lists configured providers with their models and starts on the server default", async () => {
      setup();
      const picker = await screen.findByLabelText("AI model");
      await waitFor(() => expect(picker).toHaveValue("mock|heuristic"));
      expect(within(picker).getAllByRole("group").map((g) => g.getAttribute("label"))).toEqual(["Anthropic", "Built-in (no API key)"]);
      expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual(["claude-sonnet-5-5", "claude-opus-5-5", "heuristic"]);
    });

    it("sends the chosen provider and model, and remembers the choice", async () => {
      const { calls } = setup();
      const picker = await screen.findByLabelText("AI model");
      await waitFor(() => expect(picker).not.toBeDisabled());
      fireEvent.change(picker, { target: { value: "anthropic|claude-opus-5-5" } });
      expect(localStorage.getItem("askModel")).toBe("anthropic|claude-opus-5-5");
      fireEvent.change(box(), { target: { value: "hello there" } });
      fireEvent.keyDown(box(), { key: "Enter" });
      await waitFor(() => expect(posts(calls)).toHaveLength(1));
      expect(posts(calls)[0].body).toEqual({ question: "hello there", provider: "anthropic", model: "claude-opus-5-5" });
    });

    it("ignores a remembered choice that no longer exists", async () => {
      localStorage.setItem("askModel", "openai|gpt-4o");
      setup();
      await waitFor(() => expect(screen.getByLabelText("AI model")).toHaveValue("mock|heuristic"));
    });
  });

  it("the all-meetings chat uses the global endpoints and asks about meetings", async () => {
    const { calls } = setup({ meetingId: null });
    fireEvent.click(await screen.findByRole("button", { name: "Summarize my last meeting" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0].path).toBe("/api/ask");
    expect(calls).toContain("/api/chat");
    expect(screen.queryByText("Ask anything about this meeting")).toBeNull();
  });

  it("scrolls to the newest message", async () => {
    setup({ history: [userMsg(1, "q"), botMsg(2, "a")] });
    await screen.findByText("a");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
