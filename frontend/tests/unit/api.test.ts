import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, apiUrl, query, send } from "@/lib/api";

const respond = (status: number, body?: unknown, statusText = "") =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), { status, statusText }));

afterEach(() => vi.restoreAllMocks());

describe("api", () => {
  it("returns parsed JSON and calls the backend url", async () => {
    const spy = respond(200, { ok: 1 });
    expect(await api("/api/health")).toEqual({ ok: 1 });
    expect(spy.mock.calls[0][0]).toBe(apiUrl("/api/health"));
  });

  it("returns undefined for 204 No Content", async () => {
    respond(204);
    expect(await api("/api/x", { method: "DELETE" })).toBeUndefined();
  });

  it("uses the server's message for string errors", async () => {
    respond(400, { detail: "Transcript is empty" });
    await expect(api("/x")).rejects.toMatchObject({ message: "Transcript is empty", status: 400 });
  });

  it("turns validation errors into one readable sentence naming the field", async () => {
    respond(422, { detail: [{ loc: ["body", "title"], msg: "String should have at least 1 character" }] });
    await expect(api("/x")).rejects.toThrow("title: String should have at least 1 character");
  });

  it("falls back to the status text when the error body is not JSON", async () => {
    respond(502, "<html>Bad gateway</html>", "Bad Gateway");
    await expect(api("/x")).rejects.toMatchObject({ message: "Bad Gateway", status: 502 });
  });

  it("explains a network failure instead of leaking 'Failed to fetch'", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, message: expect.stringContaining("backend") });
  });
});

describe("send", () => {
  it("builds a JSON request", () => {
    expect(send("PATCH", { a: 1 })).toEqual({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
  });
  it("sends no body when there is none", () => {
    expect(send("POST").body).toBeUndefined();
  });
});

describe("query", () => {
  it("skips empty values and keeps false and 0", () => {
    expect(query({ q: "", a: undefined, done: false, n: 0 })).toBe("?done=false&n=0");
  });
  it("repeats array keys", () => {
    expect(query({ participant: [1, 2], topic: ["a", "b"] })).toBe("?participant=1&participant=2&topic=a&topic=b");
  });
  it("encodes special characters", () => {
    expect(query({ q: "a&b=c d%" })).toBe("?q=a%26b%3Dc+d%25");
  });
  it("is empty when nothing is set", () => {
    expect(query({})).toBe("");
    expect(query({ x: [] })).toBe("");
  });
});
