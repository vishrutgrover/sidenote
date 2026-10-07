"use client";
import { useState } from "react";
import type { ActionItem } from "./types";

/**
 * Ticking a task shows at once and is saved in the background. A tick belongs to the exact list it was made on,
 * so as soon as the list is reloaded (a new array) the server's answer takes over and the tick is forgotten.
 */
export function useTicks(items: ActionItem[]) {
  const [ticks, setTicks] = useState<Record<number, { value: boolean; list: ActionItem[] }>>({});
  const isDone = (i: ActionItem) => (ticks[i.id]?.list === items ? ticks[i.id].value : i.is_done);

  /** `save` returns whether it worked; if not, the tick is put back. */
  async function toggle(item: ActionItem, save: (done: boolean) => Promise<boolean>) {
    const value = !isDone(item);
    setTicks((t) => ({ ...t, [item.id]: { value, list: items } }));
    if (!(await save(value))) {
      setTicks((t) => {
        const rest = { ...t };
        delete rest[item.id];
        return rest;
      });
    }
  }
  return { isDone, toggle };
}
