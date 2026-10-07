"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";

export type Fetched<T> = { data?: T; error?: string; loading: boolean; reload: () => void };

/** GET a path and keep the result. Pass null to wait (e.g. until an id is known). reload() fetches again. */
export function useFetch<T>(path: string | null): Fetched<T> {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: path !== null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let current = true; // ignore the answer if the path changed or the page closed meanwhile
    api<T>(path)
      .then((data) => current && setState({ data, loading: false }))
      .catch((e: Error) => current && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => {
      current = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** A value that follows `value` after it has stopped changing for `ms`. For search-as-you-type. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Calls handler on a document-level key press (e.g. Cmd+K). */
export function useHotkey(test: (e: KeyboardEvent) => boolean, handler: () => void) {
  const latest = useRef({ test, handler });
  useEffect(() => {
    latest.current = { test, handler };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => latest.current.test(e) && (e.preventDefault(), latest.current.handler());
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);
}


const listeners = new Set<() => void>();
const subscribe = (callback: () => void) => {
  listeners.add(callback);
  window.addEventListener("storage", callback); // another tab changed it
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
};

/** A string kept in localStorage. Renders `fallback` on the server and first paint, then the saved value. */
export function useLocalStorage<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (value: T) => void] {
  const read = () => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      return saved !== null && (!allowed || allowed.includes(saved)) ? saved : fallback;
    } catch {
      return fallback; // storage blocked (private window)
    }
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
