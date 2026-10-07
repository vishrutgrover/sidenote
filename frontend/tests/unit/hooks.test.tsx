import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounced, useFetch, useHotkey, useLocalStorage } from "@/lib/hooks";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("useFetch", () => {
  it("goes from loading to data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ n: 1 }));
    const { result } = renderHook(() => useFetch<{ n: number }>("/api/x"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    expect(result.current.loading).toBe(false);
  });

  it("reports an error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ detail: "Meeting not found" }, 404));
    const { result } = renderHook(() => useFetch("/api/x"));
    await waitFor(() => expect(result.current.error).toBe("Meeting not found"));
    expect(result.current.loading).toBe(false);
  });

  it("does nothing while the path is null", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useFetch(null));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("starts when the path becomes known", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true }));
    const { result, rerender } = renderHook(({ p }: { p: string | null }) => useFetch(p), { initialProps: { p: null as string | null } });
    rerender({ p: "/api/y" });
    await waitFor(() => expect(result.current.data).toEqual({ ok: true }));
  });

  it("ignores a slow answer for an old path (no stale data after navigating)", async () => {
    let finishSlow!: (r: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
      String(url).endsWith("/slow") ? new Promise<Response>((r) => (finishSlow = r)) : Promise.resolve(json({ from: "fast" })));
    const { result, rerender } = renderHook(({ p }) => useFetch<{ from: string }>(p), { initialProps: { p: "/slow" } });
    rerender({ p: "/fast" });
    await waitFor(() => expect(result.current.data).toEqual({ from: "fast" }));
    await act(async () => finishSlow(json({ from: "slow" })));
    expect(result.current.data).toEqual({ from: "fast" });
  });

  it("reload fetches again", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(json({ t: Math.random() })));
    const { result } = renderHook(() => useFetch<{ t: number }>("/api/x"));
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = result.current.data;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).not.toEqual(first));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("useDebounced", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits until the value stops changing", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 200), { initialProps: { v: "a" } });
    rerender({ v: "ab" });
    act(() => vi.advanceTimersByTime(150));
    rerender({ v: "abc" });
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(60));
    expect(result.current).toBe("abc");
  });
});

describe("useLocalStorage", () => {
  it("returns the fallback, then the saved value, and persists changes", () => {
    const { result, unmount } = renderHook(() => useLocalStorage<string>("k", "one"));
    expect(result.current[0]).toBe("one");
    act(() => result.current[1]("two"));
    expect(result.current[0]).toBe("two");
    expect(localStorage.getItem("k")).toBe("two");
    unmount();
    expect(renderHook(() => useLocalStorage<string>("k", "one")).result.current[0]).toBe("two");
  });

  it("ignores saved values that are not allowed", () => {
    localStorage.setItem("k", "garbage");
    expect(renderHook(() => useLocalStorage("k", "a", ["a", "b"] as const)).result.current[0]).toBe("a");
  });

  it("keeps working when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    const { result } = renderHook(() => useLocalStorage<string>("k", "fallback"));
    expect(result.current[0]).toBe("fallback");
    expect(() => act(() => result.current[1]("x"))).not.toThrow();
  });

  it("updates every component using the same key", () => {
    const a = renderHook(() => useLocalStorage<string>("shared", "x"));
    const b = renderHook(() => useLocalStorage<string>("shared", "x"));
    act(() => a.result.current[1]("y"));
    expect(b.result.current[0]).toBe("y");
  });
});

describe("useHotkey", () => {
  function Probe({ onKey }: { onKey: () => void }) {
    useHotkey((e) => (e.metaKey || e.ctrlKey) && e.key === "k", onKey);
    return <p>probe</p>;
  }

  it("fires for the matching key and blocks the browser default", () => {
    const onKey = vi.fn();
    render(<Probe onKey={onKey} />);
    const notCancelled = fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(onKey).toHaveBeenCalledOnce();
    expect(notCancelled).toBe(false);
  });

  it("ignores other keys and does not block them", () => {
    const onKey = vi.fn();
    render(<Probe onKey={onKey} />);
    expect(fireEvent.keyDown(document, { key: "k" })).toBe(true);
    fireEvent.keyDown(document, { key: "j", ctrlKey: true });
    expect(onKey).not.toHaveBeenCalled();
  });

  it("always calls the latest handler and stops after unmount", () => {
    const first = vi.fn(), second = vi.fn();
    const { rerender, unmount } = render(<Probe onKey={first} />);
    rerender(<Probe onKey={second} />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    unmount();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(second).toHaveBeenCalledOnce();
    expect(screen.queryByText("probe")).toBeNull();
  });
});
