"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useFetch, useLocalStorage } from "@/lib/hooks";
import { initials } from "@/lib/format";
import type { Me } from "@/lib/types";
import { useNavDrawer } from "./NavDrawer";
import { LogoMark } from "./Logo";
import { NAV, NAV_BOTTOM, type NavItem } from "./nav";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const pathname = usePathname();
  const { data: me } = useFetch<Me>("/api/me");
  const [state, setState] = useLocalStorage<"open" | "collapsed">("sidebar", "open");
  const { open, setOpen } = useNavDrawer();
  const collapsed = state === "collapsed";
  const toggle = () => setState(collapsed ? "open" : "collapsed");

  const link = ({ href, label, icon: Icon, soon }: NavItem) => {
    const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    return (
      <Link key={href} href={href} className={`${styles.item} ${active ? styles.active : ""}`} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined}>
        <Icon size={18} />
        {!collapsed && <span>{label}</span>}
        {!collapsed && soon && <span className={styles.soon}>Soon</span>}
      </Link>
    );
  };

  return (
    <>
    {open && <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden />}
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""} ${open ? styles.open : ""}`} aria-label="Main navigation">
      <div className={styles.head}>
        <Link href="/" aria-label="Sidenote home" className={styles.brand}>
          <LogoMark size={26} />
          {!collapsed && <span>Sidenote</span>}
        </Link>
        <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className={styles.nav}>
        {NAV.map((group, i) => (
          <div key={i} className={styles.group}>
            {group.map(link)}
          </div>
        ))}
      </nav>

      <div className={styles.bottom}>
        {NAV_BOTTOM.map(link)}
        <div className={styles.me} title={collapsed ? me?.name : undefined}>
          <span className="avatar" style={{ background: "var(--primary)" }}>
            {me ? initials(me.name) : ""}
          </span>
          {!collapsed && <span className={styles.name}>{me?.name ?? ""}</span>}
        </div>
      </div>
    </aside>
    </>
  );
}
