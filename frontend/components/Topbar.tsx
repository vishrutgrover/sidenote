"use client";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useSearch } from "./SearchProvider";
import { useNavDrawer } from "./NavDrawer";
import { pageTitle } from "./nav";
import styles from "./Topbar.module.css";

export function Topbar({ children }: { children?: React.ReactNode }) {
  const title = pageTitle(usePathname());
  const { open } = useSearch();
  const nav = useNavDrawer();
  return (
    <header className={styles.bar}>
      <button className={`btn btn-ghost btn-icon ${styles.menu}`} onClick={() => nav.setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
      <h1 className={styles.title}>{title}</h1>
      <button className={styles.search} onClick={open} aria-label="Open global search">
        <Search size={16} />
        <span>Search by title or keyword</span>
        <kbd>⌘K</kbd>
      </button>
      <div className={styles.right}>{children}</div>
    </header>
  );
}
