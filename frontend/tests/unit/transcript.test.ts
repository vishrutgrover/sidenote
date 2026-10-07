import { describe, expect, it } from "vitest";
import { activeIndex, highlightPieces, queryWords, startsNewSpeaker } from "@/lib/transcript";

const at = (...starts: number[]) => starts.map((start_sec) => ({ start_sec }));

describe("activeIndex", () => {
  const lines = at(0, 10, 25, 40);
  it.each([[-1, -1], [0, 0], [9.99, 0], [10, 1], [24.9, 1], [25, 2], [40, 3], [9999, 3]])("time %s -> line %s", (time, index) => {
    expect(activeIndex(lines, time)).toBe(index);
  });
  it("is -1 before the first line when it starts late", () => expect(activeIndex(at(5, 10), 2)).toBe(-1));
  it("handles empty and single-line transcripts", () => {
    expect(activeIndex([], 3)).toBe(-1);
    expect(activeIndex(at(0), 100)).toBe(0);
  });
  it("agrees with a simple scan for every time across a long transcript", () => {
    const long = at(...Array.from({ length: 300 }, (_, i) => i * 7.3));
    for (let t = -5; t < 2300; t += 3.7) {
      const scan = long.reduce((acc, l, i) => (l.start_sec <= t ? i : acc), -1);
      expect(activeIndex(long, t)).toBe(scan);
    }
  });
});

describe("queryWords", () => {
  it("splits on anything that is not a word character", () => {
    expect(queryWords("quick-overview, now!")).toEqual(["quick", "overview", "now"]);
    expect(queryWords("   ")).toEqual([]);
    expect(queryWords("")).toEqual([]);
    expect(queryWords("café ☕")).toEqual(["caf"]); // \w is ASCII only; the server tokenizes unicode, so a line may be flagged with no mark
  });
});

describe("highlightPieces", () => {
  const joined = (p: { text: string }[]) => p.map((x) => x.text).join("");

  it("marks words that start with a query word, case-insensitively", () => {
    const p = highlightPieces("We are Launching the launch plan", "launch");
    expect(p.filter((x) => x.hit).map((x) => x.text)).toEqual(["Launching", "launch"]);
  });

  it("keeps all the text, in order", () => {
    const text = "Ship it, then ship more. Reshipping is not a word hit.";
    expect(joined(highlightPieces(text, "ship"))).toBe(text);
  });

  it("only matches at the start of a word", () => {
    expect(highlightPieces("relaunch", "launch")).toEqual([{ text: "relaunch", hit: false }]);
  });

  it("matches any of several words", () => {
    expect(highlightPieces("budget and roadmap", "road budget").filter((x) => x.hit).map((x) => x.text)).toEqual(["budget", "roadmap"]);
  });

  it("returns the text untouched for an empty query or no match", () => {
    expect(highlightPieces("hello", "")).toEqual([{ text: "hello", hit: false }]);
    expect(highlightPieces("hello", "zzz")).toEqual([{ text: "hello", hit: false }]);
    expect(highlightPieces("", "zzz")).toEqual([{ text: "", hit: false }]);
  });

  it("treats regex characters in the query as plain text", () => {
    expect(highlightPieces("a (b) c.* d", "(b) .*").length).toBeGreaterThan(0); // does not throw
    expect(() => highlightPieces("text", "[")).not.toThrow();
    expect(highlightPieces("price is 5+5", "5+5").filter((x) => x.hit).length).toBeGreaterThan(0);
  });
});

describe("startsNewSpeaker", () => {
  const s = (id: number | null) => ({ speaker: id === null ? null : ({ id } as never) });
  it("is true for the first line and whenever the speaker changes", () => {
    const lines = [s(1), s(1), s(2), s(null), s(null), s(1)];
    expect(lines.map((_, i) => startsNewSpeaker(lines, i))).toEqual([true, false, true, true, false, true]);
  });
});
