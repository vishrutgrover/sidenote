import type { Segment } from "./types";

/** Index of the line being spoken at `time`: the last one that has started. -1 before the first line. */
export function activeIndex(lines: Pick<Segment, "start_sec">[], time: number): number {
  let lo = 0, hi = lines.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start_sec <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Words to look for in a line for a search query: the same words the server matches, the last as a prefix. */
export function queryWords(query: string): string[] {
  return query.match(/\w+/g) ?? [];
}

export type Piece = { text: string; hit: boolean };

/** Cut text into pieces so the matching words can be wrapped in <mark>. A word matches when it starts with a query word. */
export function highlightPieces(text: string, query: string): Piece[] {
  const words = queryWords(query);
  if (!words.length) return [{ text, hit: false }];
  const pattern = new RegExp(`\\b(?:${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\w*`, "gi");
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) pieces.push({ text: text.slice(last, m.index), hit: false });
    pieces.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), hit: false });
  return pieces.length ? pieces : [{ text, hit: false }];
}

/** True when this line should repeat the speaker's name (a new speaker started talking). */
export const startsNewSpeaker = (lines: Pick<Segment, "speaker">[], i: number) =>
  i === 0 || (lines[i].speaker?.id ?? null) !== (lines[i - 1].speaker?.id ?? null);
