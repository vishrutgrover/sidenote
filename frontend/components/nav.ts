import { BarChart3, Bot, Home, Layers, ListChecks, Settings, Sparkles, Users, Video, Zap } from "lucide-react";

export type NavItem = { href: string; label: string; icon: typeof Home; soon?: boolean };

// Each inner list is one group in the sidebar, separated by a line.
export const NAV: NavItem[][] = [
  [
    { href: "/", label: "Home", icon: Home },
    { href: "/ask", label: "Ask Sidenote", icon: Bot },
  ],
  [
    { href: "/meetings", label: "Meetings", icon: Video },
    { href: "/tasks", label: "Tasks", icon: ListChecks },
    { href: "/people", label: "People", icon: Users },
    { href: "/ai-skills", label: "AI Skills", icon: Sparkles, soon: true },
  ],
  [
    { href: "/analytics", label: "Analytics", icon: BarChart3, soon: true },
    { href: "/voice-agents", label: "Voice Agents", icon: Zap, soon: true },
  ],
];

export const NAV_BOTTOM: NavItem[] = [
  { href: "/integrations", label: "Integrations", icon: Layers, soon: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

const TITLES: [string, string][] = [
  ["/meetings", "Meetings"],
  ["/tasks", "Tasks"],
  ["/people", "People"],
  ["/ask", "Ask Sidenote"],
  ["/ai-skills", "AI Skills"],
  ["/analytics", "Analytics"],
  ["/voice-agents", "Voice Agents"],
  ["/integrations", "Integrations"],
];

/** Title shown in the top bar for a path. */
export function pageTitle(pathname: string): string {
  return TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"))?.[1] ?? "Home";
}
