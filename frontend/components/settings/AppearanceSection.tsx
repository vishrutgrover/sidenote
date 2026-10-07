"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "../ThemeProvider";
import styles from "./settings.module.css";

const CHOICES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <h1>Language &amp; Appearance</h1>
      <section className={`card ${styles.card}`}>
        <h2>Theme</h2>
        <p className="muted">Choose how the application looks. Select System to automatically match your device settings.</p>
        <div className={styles.choices} role="radiogroup" aria-label="Theme">
          {CHOICES.map(({ id, label, icon: Icon }) => (
            <button key={id} role="radio" aria-checked={theme === id} className={theme === id ? styles.picked : ""} onClick={() => setTheme(id)}>
              <Icon size={20} /> {label}
            </button>
          ))}
        </div>
      </section>
      <section className={`card ${styles.card}`}>
        <h2>Language</h2>
        <p className="muted">Sidenote works with English transcripts. More languages are coming soon.</p>
        <select className="input" style={{ maxWidth: 260 }} disabled aria-label="Language"><option>English (Global)</option></select>
      </section>
    </>
  );
}
