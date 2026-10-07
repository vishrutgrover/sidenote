"use client";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useSearch } from "./SearchProvider";
import { pageTitle } from "./nav";
import styles from "./Topbar.module.css";

export function Topbar({ children }: { children?: React.ReactNode }) {
  const title = pageTitle(usePathname());
  const { open } = useSearch();
  return (
    <header className={styles.bar}>
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
