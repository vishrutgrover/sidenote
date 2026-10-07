import { describe, expect, it } from "vitest";
import { clock, dayLabel, duration, greeting, initials, localDayBounds, parseServerDate, timeLabel } from "@/lib/format";

describe("parseServerDate", () => {
  it("reads a time without a zone as UTC", () => {
    expect(parseServerDate("2026-10-07T18:25:00").toISOString()).toBe("2026-10-07T18:25:00.000Z");
  });
  it("leaves times that already say their zone alone", () => {
    expect(parseServerDate("2026-10-07T18:25:00Z").toISOString()).toBe("2026-10-07T18:25:00.000Z");
    expect(parseServerDate("2026-10-07T18:25:00+05:30").toISOString()).toBe("2026-10-07T12:55:00.000Z");
    expect(parseServerDate("2026-10-07T18:25:00-07:00").toISOString()).toBe("2026-10-08T01:25:00.000Z");
  });
});

describe("clock", () => {
  it.each([[0, "00:00"], [59.9, "00:59"], [83, "01:23"], [3725, "62:05"], [-5, "00:00"], [NaN, "00:00"], [Infinity, "00:00"]])("%s -> %s", (sec, out) => {
    expect(clock(sec)).toBe(out);
  });
});

describe("duration", () => {
  it.each([[0, "1 min"], [20, "1 min"], [89, "1 min"], [91, "2 min"], [560, "9 min"], [3600, "1 h"], [3900, "1 h 5 min"], [7260, "2 h 1 min"]])("%s -> %s", (sec, out) => {
    expect(duration(sec)).toBe(out);
  });
});

describe("dayLabel (viewer in Los Angeles)", () => {
  const now = new Date("2026-10-07T20:00:00-07:00");
  it("says Today and Yesterday", () => {
    expect(dayLabel("2026-10-07T18:00:00", now)).toBe("Today");
    expect(dayLabel("2026-10-06T18:00:00", now)).toBe("Yesterday");
  });
  it("uses the viewer's calendar, not UTC: 02:00 UTC on Oct 8 is still the evening of Oct 7 in LA", () => {
    expect(dayLabel("2026-10-08T02:00:00", now)).toBe("Today");
    expect(timeLabel("2026-10-08T02:00:00")).toBe("7:00 PM");
  });
  it("shows month and day for older dates, adding the year for another year", () => {
    expect(dayLabel("2026-09-30T18:00:00", now)).toBe("Sep 30");
    expect(dayLabel("2025-12-31T18:00:00", now)).toBe("Dec 31, 2025");
  });
  it("handles the month boundary for yesterday", () => {
    expect(dayLabel("2026-09-30T18:00:00", new Date("2026-10-01T12:00:00-07:00"))).toBe("Yesterday");
  });
});

describe("localDayBounds", () => {
  it("returns the viewer's midnight to midnight as UTC instants", () => {
    expect(localDayBounds(new Date("2026-10-07T15:30:00-07:00"))).toEqual({ after: "2026-10-07T07:00:00.000Z", before: "2026-10-08T07:00:00.000Z" });
  });
  it("is 23 hours long on the day clocks go forward and 25 when they go back", () => {
    const len = (d: string) => { const b = localDayBounds(new Date(d)); return (Date.parse(b.before) - Date.parse(b.after)) / 3600000; };
    expect(len("2026-03-08T12:00:00-07:00")).toBe(23);
    expect(len("2026-11-01T12:00:00-08:00")).toBe(25);
  });
});

describe("initials", () => {
  it.each([["Vishrut Grover", "VG"], ["maya", "M"], ["  Ana   Maria   Lopez ", "AM"], ["", "?"], ["   ", "?"]])("%j -> %s", (name, out) => {
    expect(initials(name)).toBe(out);
  });
});

describe("greeting", () => {
  it.each([[2, "Good Night"], [5, "Good Morning"], [11, "Good Morning"], [12, "Good Afternoon"], [17, "Good Evening"], [21, "Good Night"]])("%s o'clock -> %s", (hour, out) => {
    expect(greeting(new Date(2026, 9, 7, hour))).toBe(out);
  });
});
