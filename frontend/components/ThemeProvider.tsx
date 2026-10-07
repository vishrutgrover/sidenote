"use client";
import { createContext, useContext, useEffect } from "react";
import { useLocalStorage } from "@/lib/hooks";

export type Theme = "light" | "dark" | "system";
const THEMES = ["light", "dark", "system"] as const;
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "system", setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

const isDark = (theme: Theme) => theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);

/** The choice is stored in localStorage; the layout's inline script applies it before first paint. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useLocalStorage<Theme>("theme", "system", THEMES);

  useEffect(() => {
    const apply = () => (document.documentElement.dataset.theme = isDark(theme) ? "dark" : "light");
    apply();
    if (theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply); // follow the operating system while on "system"
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
