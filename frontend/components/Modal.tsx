"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import styles from "./Modal.module.css";

type Props = { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean };

/** A dialog built on the native <dialog> element: it traps focus and closes on Escape by itself.
 *  The content only exists while open, so forms start fresh every time. */
export function Modal({ open, onClose, title, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${wide ? styles.wide : ""}`}
      aria-labelledby={titleId}
      onClose={onClose} // fires for Escape too
      onMouseDown={(e) => e.target === ref.current && onClose()} // a click on the dark backdrop
    >
      {open && (
        <div className={styles.box}>
          <header className={styles.header}>
            <h2 id={titleId}>{title}</h2>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
