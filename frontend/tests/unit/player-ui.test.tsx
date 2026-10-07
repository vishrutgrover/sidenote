import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerBar } from "@/components/PlayerBar";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { fakePlayer, line, mockApi, transcript } from "./helpers/fixtures";

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe("PlayerBar", () => {
  it("shows the time and describes the seek position for screen readers", () => {
    render(<PlayerBar player={fakePlayer({ time: 83, duration: 3725 })} />);
    expect(screen.getByLabelText("Time")).toHaveTextContent("01:23 / 62:05");
    expect(screen.getByLabelText("Seek")).toHaveAttribute("aria-valuetext", "01:23 of 62:05");
  });

  it("play button says what it will do", () => {
    const toggle = vi.fn();
    const { rerender } = render(<PlayerBar player={fakePlayer({ toggle })} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(toggle).toHaveBeenCalledOnce();
    rerender(<PlayerBar player={fakePlayer({ toggle, playing: true })} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("skips 10 seconds either way", () => {
    const skip = vi.fn();
    render(<PlayerBar player={fakePlayer({ skip })} />);
    fireEvent.click(screen.getByRole("button", { name: "Back 10 seconds" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(skip.mock.calls).toEqual([[-10], [10]]);
  });

  it.each([[0.75, 1], [1, 1.25], [1.25, 1.5], [1.5, 2], [2, 0.75]])("speed %s× goes to %s×", (from, to) => {
    const setSpeed = vi.fn();
    render(<PlayerBar player={fakePlayer({ speed: from, setSpeed })} />);
    fireEvent.click(screen.getByTitle("Playback speed"));
    expect(setSpeed).toHaveBeenCalledWith(to);
  });

  it("seeks when the bar is moved", () => {
    const seek = vi.fn();
    render(<PlayerBar player={fakePlayer({ seek })} />);
    fireEvent.change(screen.getByLabelText("Seek"), { target: { value: "42.5" } });
    expect(seek).toHaveBeenCalledWith(42.5);
  });

  it("does not break for a zero-length recording", () => {
    render(<PlayerBar player={fakePlayer({ duration: 0, time: 0 })} />);
    expect(screen.getByLabelText("Time")).toHaveTextContent("00:00 / 00:00");
  });

  it("renders extra buttons passed in", () => {
    render(<PlayerBar player={fakePlayer()}><button>star</button></PlayerBar>);
    expect(screen.getByRole("button", { name: "star" })).toBeInTheDocument();
  });
});

describe("TranscriptPanel", () => {
  const withMatches = (ids: number[]) => (url: string) => {
    const q = new URL("http://x" + url).searchParams.get("q");
    return transcript.map((l) => ({ ...l, match: q ? ids.includes(l.id) : false }));
  };
  const api = (ids: number[] = [2, 5]) => mockApi({ "/api/meetings/1/transcript": withMatches(ids) });
  const panel = (player = fakePlayer(), over: Partial<React.ComponentProps<typeof TranscriptPanel>> = {}) =>
    <TranscriptPanel meetingId={1} lines={transcript} loading={false} player={player} {...over} />;
  const renderPanel = (player = fakePlayer(), over = {}) => render(panel(player, over));
  const lineEl = (id: number) => document.querySelector(`[data-line="${id}"]`) as HTMLElement;

  it("shows a placeholder while loading, then every line with its time", async () => {
    api();
    const { container, rerender } = renderPanel(fakePlayer(), { lines: [], loading: true });
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    rerender(panel());
    expect(await screen.findByText(/Welcome everyone/)).toBeInTheDocument();
    expect(screen.getByText("00:40")).toBeInTheDocument();
    expect(screen.getAllByTitle(/Jump to/)).toHaveLength(5);
  });

  it("names the speaker only when the speaker changes", async () => {
    api();
    renderPanel();
    await screen.findByText(/Welcome everyone/);
    expect(screen.getAllByText("Vishrut Grover")).toHaveLength(2); // lines 1 and 5; line 2 continues the same speaker
    expect(screen.getAllByText("Maya Chen")).toHaveLength(1); // lines 3 and 4 share one header
  });

  it("marks the line being spoken and moves the mark as time passes", async () => {
    api();
    const { rerender } = renderPanel(fakePlayer({ time: 12 }));
    await screen.findByText(/Welcome everyone/);
    expect(lineEl(2)).toHaveAttribute("aria-current", "true");
    rerender(panel(fakePlayer({ time: 31 })));
    expect(lineEl(2)).not.toHaveAttribute("aria-current");
    expect(lineEl(4)).toHaveAttribute("aria-current", "true");
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(1);
  });

  it("jumps the player to a clicked line", async () => {
    api();
    const seek = vi.fn();
    renderPanel(fakePlayer({ seek }));
    fireEvent.click(await screen.findByText(/I agree, the launch date/));
    expect(seek).toHaveBeenCalledWith(20);
  });

  it("scrolls to follow the speaker only while playing", async () => {
    api();
    const { rerender } = renderPanel(fakePlayer({ time: 12, playing: false }));
    await screen.findByText(/Welcome everyone/);
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(panel(fakePlayer({ time: 12, playing: true })));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollIntoView.mockClear();
    rerender(panel(fakePlayer({ time: 22, playing: true })));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  });

  it("stops following when the reader scrolls, offers a way back, and a click on a line resumes", async () => {
    api();
    const { rerender } = renderPanel(fakePlayer({ time: 12, playing: true }));
    await screen.findByText(/Welcome everyone/);
    fireEvent.wheel(document.querySelector("[class*=lines]")!);
    scrollIntoView.mockClear();
    rerender(panel(fakePlayer({ time: 22, playing: true })));
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /Jump to current/ }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Jump to current/ })).toBeNull();
  });

  describe("find", () => {
    const type = async (text: string) => {
      fireEvent.change(await screen.findByLabelText("Find in transcript"), { target: { value: text } });
    };

    it("highlights matching words, counts matches and scrolls to the first", async () => {
      api([2, 5]);
      renderPanel();
      await screen.findByText(/Welcome everyone/);
      await type("budget");
      expect(await screen.findByText("1 of 2")).toBeInTheDocument();
      expect(document.querySelectorAll("mark")).toHaveLength(2);
      expect(lineEl(2).className).toMatch(/currentMatch/);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    });

    it("highlights only on lines the server matched, so the marks agree with the count", async () => {
      api([2]); // the server says only line 2 matches, although line 5 also contains the word "budget"
      renderPanel();
      await screen.findByText(/Welcome everyone/);
      await type("budget");
      await screen.findByText("1 of 1");
      expect(document.querySelectorAll("mark")).toHaveLength(1);
      expect(lineEl(2).querySelector("mark")).not.toBeNull();
      expect(lineEl(5).querySelector("mark")).toBeNull();
    });

    it("steps through matches with the buttons and Enter, wrapping around", async () => {
      api([2, 5]);
      renderPanel();
      await screen.findByText(/Welcome everyone/);
      await type("budget");
      await screen.findByText("1 of 2");
      fireEvent.click(screen.getByRole("button", { name: "Next match" }));
      expect(screen.getByText("2 of 2")).toBeInTheDocument();
      fireEvent.keyDown(screen.getByLabelText("Find in transcript"), { key: "Enter" });
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
      fireEvent.keyDown(screen.getByLabelText("Find in transcript"), { key: "Enter", shiftKey: true });
      expect(screen.getByText("2 of 2")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });

    it("says when nothing matches and disables stepping", async () => {
      api([]);
      renderPanel();
      await screen.findByText(/Welcome everyone/);
      await type("zeppelin");
      expect(await screen.findByText("No matches")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled();
      expect(document.querySelectorAll("mark")).toHaveLength(0);
    });

    it("clears with the x button or Escape and removes every highlight", async () => {
      api([2, 5]);
      renderPanel();
      await screen.findByText(/Welcome everyone/);
      await type("budget");
      await screen.findByText("1 of 2");
      fireEvent.click(screen.getByRole("button", { name: "Clear find" }));
      expect(document.querySelectorAll("mark")).toHaveLength(0);
      expect(screen.queryByText("1 of 2")).toBeNull();
      await type("budget");
      fireEvent.keyDown(screen.getByLabelText("Find in transcript"), { key: "Escape" });
      expect(screen.getByLabelText("Find in transcript")).toHaveValue("");
    });

    it("a new search starts again at its first match", async () => {
      api([2, 5]);
      renderPanel();
      await screen.findByText(/Welcome everyone/);
      await type("budget");
      await screen.findByText("1 of 2");
      fireEvent.click(screen.getByRole("button", { name: "Next match" }));
      await type("budgets");
      await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
    });

    it("waits for typing to pause before asking the server", async () => {
      const calls = api();
      renderPanel();
      await screen.findByText(/Welcome everyone/);
      const before = calls.length;
      for (const t of ["b", "bu", "bud"]) fireEvent.change(screen.getByLabelText("Find in transcript"), { target: { value: t } });
      await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
      expect(calls.length).toBe(before);
      await waitFor(() => expect(calls.at(-1)).toContain("q=bud"));
    });

    it("ignores whitespace-only searches", async () => {
      const calls = api();
      renderPanel();
      await screen.findByText(/Welcome everyone/);
      await type("   ");
      await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
      expect(calls.filter((c) => c.includes("q="))).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Next match" })).toBeNull();
    });
  });

  it("shows the message when the transcript cannot load", async () => {
    renderPanel(fakePlayer(), { lines: [], error: "Meeting not found" });
    expect(await screen.findByText("Meeting not found")).toBeInTheDocument();
  });

  it("copes with lines that have no speaker", async () => {
    renderPanel(fakePlayer(), { lines: [line(1, 0, "Orphan line", null)] });
    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Orphan line")).toBeInTheDocument();
  });
});
