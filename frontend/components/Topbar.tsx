"use client";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { pageTitle } from "./nav";
import styles from "./Topbar.module.css";

export function Topbar({ children }: { children?: React.ReactNode }) {
  const title = pageTitle(usePathname());
  return (
    <header className={styles.bar}>
      <h1 className={styles.title}>{title}</h1>
      <button className={styles.search} aria-label="Open global search">
        <Search size={16} />
        <span>Search by title or keyword</span>
        <kbd>⌘K</kbd>
      </button>
      <div className={styles.right}>{children}</div>
    </header>
  );
}
