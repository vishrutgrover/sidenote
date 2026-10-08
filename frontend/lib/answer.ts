type Part = string | { bold: string } | { time: number; label: string };
type Block = { kind: "p" | "li"; parts: Part[] };

// **bold**, or a citation: [01:23] or several in one bracket, [00:25, 01:14]
const TOKEN = /\*\*(.+?)\*\*|\[(\d+:\d{2}(?:,\s*\d+:\d{2})*)\]/g;
const TIME = /(\d+):(\d{2})/g;

const cite = (m: RegExpMatchArray): Part => ({ time: Number(m[1]) * 60 + Number(m[2]), label: `${m[1]}:${m[2]}` });

/** An answer as paragraphs and bullet points, with **bold** kept and each "[01:23]" turned into something clickable. */
export function parseAnswer(text: string): Block[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const heading = /^#{1,6}\s+/.test(line);
      const bullet = /^([-*]|\d+[.)])\s+/.test(line);
      const body = line.replace(/^(#{1,6}|[-*]|\d+[.)])\s+/, "");
      const parts: Part[] = [];
      let last = 0;
      for (const m of body.matchAll(TOKEN)) {
        if (m.index > last) parts.push(body.slice(last, m.index));
        if (m[1] !== undefined) parts.push({ bold: m[1] });
        else [...m[2].matchAll(TIME)].forEach((t, i) => { if (i) parts.push(", "); parts.push(cite(t)); });
        last = m.index + m[0].length;
      }
      if (last < body.length) parts.push(body.slice(last));
      return { kind: bullet ? "li" : "p", parts: heading ? [{ bold: body }] : parts } as Block;
    });
}
