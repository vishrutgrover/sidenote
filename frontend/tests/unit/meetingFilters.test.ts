import { describe, expect, it } from "vitest";
import { activeFilterCount, dateBounds, NO_FILTERS, toggle, toQuery, type Filters } from "@/lib/meetingFilters";

const now = new Date("2026-10-07T20:00:00-07:00"); // Oct 7, evening, Los Angeles
const f = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });

describe("dateBounds (viewer in Los Angeles, UTC-7)", () => {
  it("any time has no bounds", () => expect(dateBounds(f({}), now)).toEqual({}));

  it("today is the viewer's midnight to midnight", () => {
    expect(dateBounds(f({ date: "today" }), now)).toEqual({ after: "2026-10-07T07:00:00.000Z", before: "2026-10-08T07:00:00.000Z" });
  });

  it("last 7 days includes today and the six days before", () => {
    expect(dateBounds(f({ date: "7" }), now)).toEqual({ after: "2026-10-01T07:00:00.000Z", before: "2026-10-08T07:00:00.000Z" });
  });

  it("last 30 days crosses a month boundary correctly", () => {
    expect(dateBounds(f({ date: "30" }), now).after).toBe("2026-09-08T07:00:00.000Z");
  });

  it("a custom range includes the whole last day", () => {
    expect(dateBounds(f({ date: "custom", from: "2026-10-01", to: "2026-10-03" }), now)).toEqual({ after: "2026-10-01T07:00:00.000Z", before: "2026-10-04T07:00:00.000Z" });
  });

  it("a custom range can be open on either side", () => {
    expect(dateBounds(f({ date: "custom", from: "2026-10-01" }), now)).toEqual({ after: "2026-10-01T07:00:00.000Z", before: undefined });
    expect(dateBounds(f({ date: "custom", to: "2026-10-03" }), now)).toEqual({ after: undefined, before: "2026-10-04T07:00:00.000Z" });
  });

  it.each(["", "garbage", "2026-02-31", "2026-13-01", "10/07/2026"])("ignores the invalid custom date %j", (bad) => {
    expect(dateBounds(f({ date: "custom", from: bad, to: bad }), now)).toEqual({ after: undefined, before: undefined });
  });
});

describe("toQuery", () => {
  it("is just the sort when nothing is set", () => expect(toQuery(NO_FILTERS, 1, now)).toBe("?sort=recent"));

  it("trims the search text and drops it when blank", () => {
    expect(toQuery(f({ q: "  roadmap " }), null, now)).toContain("q=roadmap&");
    expect(toQuery(f({ q: "   " }), null, now)).not.toContain("q=");
  });

  it("maps list filters to repeated parameters", () => {
    const q = toQuery(f({ participant: [3, 4], topic: ["planning", "customer"] }), null, now);
    expect(q).toContain("participant=3&participant=4");
    expect(q).toContain("topic=planning&topic=customer");
  });

  it("My Meetings means hosted by me, once I am known", () => {
    expect(toQuery(f({ channel: "mine" }), 7, now)).toContain("host=7");
    expect(toQuery(f({ channel: "mine" }), null, now)).not.toContain("host=");
  });

  it("an explicit host filter wins over the channel", () => {
    const q = toQuery(f({ channel: "mine", host: [9] }), 7, now);
    expect(q).toContain("host=9");
    expect(q).not.toContain("host=7");
  });

  it("Uploads covers uploaded files and pasted text", () => {
    expect(toQuery(f({ channel: "uploads" }), null, now)).toContain("source=upload&source=paste");
  });

  it.each([["lt15", "max_minutes=15", "min_minutes"], ["15-30", "min_minutes=15&max_minutes=30", ""], ["60+", "min_minutes=60", "max_minutes"]] as const)(
    "duration %s", (duration, has, hasNot) => {
      const q = toQuery(f({ duration }), null, now);
      expect(q).toContain(has);
      if (hasNot) expect(q).not.toContain(hasNot);
    });

  it("sends the date window as UTC instants", () => {
    expect(toQuery(f({ date: "today" }), null, now)).toContain("after=2026-10-07T07%3A00%3A00.000Z&before=2026-10-08T07%3A00%3A00.000Z");
  });

  it("encodes search text that looks like a query string", () => {
    expect(toQuery(f({ q: "a&sort=oldest" }), null, now)).toContain("q=a%26sort%3Doldest&sort=recent");
  });
});

describe("activeFilterCount", () => {
  it("counts only the filters inside the popover", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount(f({ q: "x", sort: "oldest", channel: "mine" }))).toBe(0);
    expect(activeFilterCount(f({ host: [1], participant: [2], topic: ["a"], date: "7", duration: "lt15" }))).toBe(5);
  });
});

describe("toggle", () => {
  it("adds a missing value and removes a present one without mutating", () => {
    const list = [1, 2];
    expect(toggle(list, 3)).toEqual([1, 2, 3]);
    expect(toggle(list, 1)).toEqual([2]);
    expect(list).toEqual([1, 2]);
  });
});

describe("display order", () => {
  it("lists every option exactly once, in the order people expect", async () => {
    const { DATE_ORDER, DATE_LABELS, DURATION_ORDER, DURATION_LABELS } = await import("@/lib/meetingFilters");
    expect(DATE_ORDER).toEqual(["any", "today", "7", "14", "30", "custom"]);
    expect([...DATE_ORDER].sort()).toEqual(Object.keys(DATE_LABELS).sort());
    expect([...DURATION_ORDER].sort()).toEqual(Object.keys(DURATION_LABELS).sort());
  });
});
