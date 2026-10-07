"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import styles from "./Toast.module.css";

type Kind = "success" | "error";
type ToastItem = { id: number; message: string; kind: Kind };

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});
/** const toast = useToast(); toast("Saved"); toast("Could not save", "error"); */
export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, kind: Kind = "success") => {
    const id = nextId++;
    setItems((list) => [...list, { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`${styles.toast} ${t.kind === "error" ? styles.error : ""}`}>
            {t.kind === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
