import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayer } from "@/lib/usePlayer";

describe("usePlayer without a recording (timer clock)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts paused at zero", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    expect(result.current).toMatchObject({ time: 0, playing: false, speed: 1, duration: 60 });
  });

  it("advances in real time while playing and stops when paused", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.time).toBeCloseTo(2, 1);
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.time).toBeCloseTo(2, 1);
    expect(result.current.playing).toBe(false);
  });

  it("runs faster at higher speeds, including a change mid-play", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    act(() => result.current.setSpeed(2));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.time).toBeCloseTo(2, 1);
    act(() => result.current.setSpeed(0.75));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.time).toBeCloseTo(2.75, 1);
  });

  it("seeks, skips and clamps to the ends of the recording", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    act(() => result.current.seek(30));
    expect(result.current.time).toBe(30);
    act(() => result.current.skip(10));
    expect(result.current.time).toBe(40);
    act(() => result.current.skip(-100));
    expect(result.current.time).toBe(0);
    act(() => result.current.seek(500));
    expect(result.current.time).toBe(60);
    act(() => result.current.seek(NaN));
    expect(result.current.time).toBe(0);
  });

  it("stops by itself at the end, and plays again from the start", () => {
    const { result } = renderHook(() => usePlayer(5, null));
    act(() => result.current.seek(4));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toMatchObject({ time: 5, playing: false });
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.time).toBeCloseTo(1, 1);
    expect(result.current.playing).toBe(true);
  });

  it("skipping while playing continues from the new position", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.skip(10));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.time).toBeCloseTo(12, 1);
  });

  it("toggle flips between playing and paused", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
  });

  it("plays a range and stops by itself at its end", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    act(() => result.current.playRange(10, 13));
    expect(result.current.time).toBe(10);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.playing).toBe(true);
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.playing).toBe(false);
    expect(result.current.time).toBeCloseTo(13, 0);
  });

  it("a range does not stop later playback: pressing play again keeps going", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    act(() => result.current.playRange(10, 12));
    act(() => vi.advanceTimersByTime(2500));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.playing).toBe(true);
    expect(result.current.time).toBeGreaterThan(14);
  });

  it("seeking by hand cancels the range, so playback carries on past its old end", () => {
    const { result } = renderHook(() => usePlayer(60, null));
    act(() => result.current.playRange(10, 12));
    act(() => result.current.seek(30));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.playing).toBe(true);
    expect(result.current.time).toBeCloseTo(35, 0);
  });

  it("stops the timer when the page goes away", () => {
    const { result, unmount } = renderHook(() => usePlayer(60, null));
    act(() => result.current.play());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("usePlayer with a recording", () => {
  let instances: FakeAudio[];

  class FakeAudio extends EventTarget {
    currentTime = 0;
    duration = NaN;
    playbackRate = 1;
    preload = "";
    paused = true;
    src: string;
    playResult: Promise<void> = Promise.resolve();
    constructor(src: string) {
      super();
      this.src = src;
      instances.push(this);
    }
    play() {
      this.paused = false;
      this.dispatchEvent(new Event("play"));
      return this.playResult;
    }
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event("pause"));
    }
    removeAttribute() {}
  }

  beforeEach(() => {
    instances = [];
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("creates one audio element for the url and follows its time", () => {
    const { result } = renderHook(() => usePlayer(60, "/media/a.mp3"));
    expect(instances).toHaveLength(1);
    expect(instances[0].src).toBe("/media/a.mp3");
    act(() => {
      instances[0].currentTime = 12.5;
      instances[0].dispatchEvent(new Event("timeupdate"));
    });
    expect(result.current.time).toBe(12.5);
  });

  it("uses the recording's own length once it is known", () => {
    const { result } = renderHook(() => usePlayer(60, "/media/a.mp3"));
    expect(result.current.duration).toBe(60);
    act(() => {
      instances[0].duration = 75.2;
      instances[0].dispatchEvent(new Event("loadedmetadata"));
    });
    expect(result.current.duration).toBe(75.2);
  });

  it("plays, pauses and reports state from the element's own events", () => {
    const { result } = renderHook(() => usePlayer(60, "/media/a.mp3"));
    act(() => result.current.play());
    expect(result.current.playing).toBe(true);
    act(() => result.current.pause());
    expect(result.current.playing).toBe(false);
    act(() => { instances[0].dispatchEvent(new Event("play")); });
    act(() => { instances[0].dispatchEvent(new Event("ended")); });
    expect(result.current.playing).toBe(false);
  });

  it("seeks by setting the element's time, and sets the speed on it", () => {
    const { result } = renderHook(() => usePlayer(60, "/media/a.mp3"));
    act(() => result.current.seek(20));
    expect(instances[0].currentTime).toBe(20);
    act(() => result.current.setSpeed(1.5));
    expect(instances[0].playbackRate).toBe(1.5);
  });

  it("remembers the speed when the recording changes", () => {
    const { result, rerender } = renderHook(({ url }) => usePlayer(60, url), { initialProps: { url: "/media/a.mp3" } });
    act(() => result.current.setSpeed(2));
    rerender({ url: "/media/b.mp3" });
    expect(instances).toHaveLength(2);
    expect(instances[1].playbackRate).toBe(2);
  });

  it("copes with the browser refusing to play", async () => {
    const { result } = renderHook(() => usePlayer(60, "/media/a.mp3"));
    instances[0].playResult = Promise.reject(new DOMException("blocked", "NotAllowedError"));
    await act(async () => result.current.play());
    expect(result.current.playing).toBe(false);
  });

  it("with a recording, a range pauses the element at its end", () => {
    const { result } = renderHook(() => usePlayer(60, "/media/a.mp3"));
    act(() => result.current.playRange(5, 8));
    expect(instances[0].currentTime).toBe(5);
    act(() => { instances[0].currentTime = 7.9; instances[0].dispatchEvent(new Event("timeupdate")); });
    expect(instances[0].paused).toBe(false);
    act(() => { instances[0].currentTime = 8.1; instances[0].dispatchEvent(new Event("timeupdate")); });
    expect(instances[0].paused).toBe(true);
    expect(result.current.playing).toBe(false);
  });

  it("stops the audio when the page goes away", () => {
    const { unmount } = renderHook(() => usePlayer(60, "/media/a.mp3"));
    instances[0].paused = false;
    unmount();
    expect(instances[0].paused).toBe(true);
  });
});
