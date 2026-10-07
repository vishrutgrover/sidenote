import { describe, expect, it } from "vitest";
import { parseAnswer } from "@/lib/answer";

describe("parseAnswer", () => {
  it("splits paragraphs and bullets and drops blank lines", () => {
    expect(parseAnswer("Here is what I found:\n\n- first\n* second\n  - third  \nEnd.")).toEqual([
      { kind: "p", parts: ["Here is what I found:"] },
      { kind: "li", parts: ["first"] },
      { kind: "li", parts: ["second"] },
      { kind: "li", parts: ["third"] },
      { kind: "p", parts: ["End."] },
    ]);
  });

  it("turns [mm:ss] into a time that can be jumped to, keeping the text around it", () => {
    expect(parseAnswer("It moves to the next sprint [01:48] and Maya agreed [02:05].")[0].parts).toEqual([
      "It moves to the next sprint ", { time: 108, label: "01:48" }, " and Maya agreed ", { time: 125, label: "02:05" }, ".",
    ]);
  });

  it("works for citations at the very start and end, and for several in a row", () => {
    expect(parseAnswer("[00:05][00:10]")[0].parts).toEqual([{ time: 5, label: "00:05" }, { time: 10, label: "00:10" }]);
  });

  it("leaves other brackets alone, including the global [Title @ 00:24] form", () => {
    expect(parseAnswer("[Weekly Sync @ 00:24] Maya: hi [note] [1:2] [aa:bb]")[0].parts).toEqual(["[Weekly Sync @ 00:24] Maya: hi [note] [1:2] [aa:bb]"]);
  });

  it("a hyphen that is not a bullet stays part of the sentence", () => {
    expect(parseAnswer("well-known -5 degrees")[0]).toEqual({ kind: "p", parts: ["well-known -5 degrees"] });
  });

  it("task answers keep their checkboxes as text", () => {
    expect(parseAnswer("- [x] Done thing (Maya)\n- [ ] Open thing")).toEqual([
      { kind: "li", parts: ["[x] Done thing (Maya)"] },
      { kind: "li", parts: ["[ ] Open thing"] },
    ]);
  });

  it("handles empty text", () => expect(parseAnswer("")).toEqual([]));
});
