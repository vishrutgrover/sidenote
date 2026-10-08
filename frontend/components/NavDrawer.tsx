"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Whether the sidebar is slid open on a phone. Closes by itself when you go to another page. */
const Ctx = createContext({ open: false, setOpen: (_: boolean) => {} });
export const useNavDrawer = () => useContext(Ctx);

export function NavDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}
