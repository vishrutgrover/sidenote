"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { useHotkey } from "@/lib/hooks";
import { CommandPalette } from "./CommandPalette";

const SearchContext = createContext<{ open: () => void }>({ open: () => {} });
export const useSearch = () => useContext(SearchContext);

/** Owns the search dialog so any page can open it, and listens for Cmd+K (Ctrl+K on Windows and Linux). */
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  useHotkey((e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k", () => setOpen((o) => !o));

  return (
    <SearchContext.Provider value={{ open: show }}>
      {children}
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </SearchContext.Provider>
  );
}
