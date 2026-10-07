const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Turns FastAPI's error body into one readable sentence. */
function messageFrom(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return `${detail[0].loc?.slice(-1)[0] ?? "input"}: ${detail[0].msg}`;
  return fallback;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running?", 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(messageFrom(body, res.statusText), res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Options for a JSON request: api("/api/x", send("PATCH", { a: 1 })) */
export const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Full URL, for links the browser opens itself (downloads, media). */
export const apiUrl = (path: string) => BASE + path;

/** Query string from an object. Skips empty values and repeats array keys. */
export function query(params: Record<string, string | number | boolean | undefined | (string | number)[]>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) if (v !== undefined && v !== "") q.append(key, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
