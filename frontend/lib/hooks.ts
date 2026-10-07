"use client";
import { type RefObject, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";

type Fetched<T> = { data?: T; error?: string; loading: boolean; reload: () => void };

/** GET a path and keep the result. Pass null to wait (e.g. until an id is known). reload() fetches again.
 *  While a new request is running, `data` still holds the previous answer and `loading` is true,
 *  so lists can stay on screen (dimmed) instead of flashing empty. */
export function useFetch<T>(path: string | null): Fetched<T> {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<{ key: string; data?: T; error?: string }>();
  const key = path === null ? null : `${path}#${tick}`; // changes when the path changes or reload() is called

  useEffect(() => {
    if (path === null) return;
    let current = true; // ignore the answer if the request was replaced or the page closed meanwhile
    const thisKey = `${path}#${tick}`;
    api<T>(path)
      .then((data) => current && setSettled({ key: thisKey, data }))
      .catch((e: Error) => current && setSettled((old) => ({ key: thisKey, data: old?.data, error: e.message })));
    return () => {
      current = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {
    data: settled?.data,
    error: settled?.key === key ? settled?.error : undefined,
    loading: key !== null && settled?.key !== key,
    reload,
  };
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


/** Close a popup when the user clicks outside it or presses Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close.current();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, active]);
}
