import { Bell, BookOpen, Code, Cookie, IdCard, Lock, Mail, SlidersHorizontal, Sparkles, Video, Wand2 } from "lucide-react";

type SettingsSection = { id: string; label: string; icon: typeof Bell; ready: boolean; group: number; blurb: string };

// Appearance and AI settings work; the rest are placeholders so the page looks like the real product.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "appearance", label: "Language & Appearance", icon: SlidersHorizontal, ready: true, group: 0, blurb: "" },
  { id: "recording", label: "Recording & Privacy", icon: Video, ready: false, group: 1, blurb: "Choose what is recorded and who can see it." },
  { id: "compliance", label: "Compliance Notification", icon: Bell, ready: false, group: 1, blurb: "Tell participants when a meeting is being captured." },
  { id: "email", label: "Email Assistant", icon: Mail, ready: false, group: 2, blurb: "Draft replies and follow-ups from your meetings." },
  { id: "ai", label: "AI Settings", icon: Wand2, ready: true, group: 3, blurb: "" },
  { id: "live", label: "Live Assist", icon: Sparkles, ready: false, group: 3, blurb: "Get help during a live call." },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen, ready: false, group: 3, blurb: "Give the assistant your own reference material." },
  { id: "api", label: "MCP & API", icon: Code, ready: false, group: 4, blurb: "Connect other tools to your meetings." },
  { id: "cookies", label: "Cookies", icon: Cookie, ready: false, group: 5, blurb: "Manage cookie preferences." },
  { id: "account", label: "Account", icon: IdCard, ready: false, group: 6, blurb: "Profile, plan and sign-in." },
  { id: "security", label: "Security overview", icon: Lock, ready: false, group: 6, blurb: "Review how your data is protected." },
];

export const sectionById = (id: string) => SETTINGS_SECTIONS.find((s) => s.id === id);
