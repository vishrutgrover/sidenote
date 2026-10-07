export type Part = string | { time: number; label: string };
export type Block = { kind: "p" | "li"; parts: Part[] };

const CITATION = /\[(\d+):(\d{2})\]/g;

/** An answer as paragraphs and bullet points, with each "[01:23]" turned into something clickable. */
export function parseAnswer(text: string): Block[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const bullet = /^[-*]\s+/.test(line);
      const body = bullet ? line.replace(/^[-*]\s+/, "") : line;
      const parts: Part[] = [];
      let last = 0;
      for (const m of body.matchAll(CITATION)) {
        if (m.index > last) parts.push(body.slice(last, m.index));
        parts.push({ time: Number(m[1]) * 60 + Number(m[2]), label: `${m[1]}:${m[2]}` });
        last = m.index + m[0].length;
      }
      if (last < body.length) parts.push(body.slice(last));
      return { kind: bullet ? "li" : "p", parts } as Block;
    });
}
