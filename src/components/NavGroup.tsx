"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A collapsible sidebar section. The label header toggles its items open/closed
 * and the state persists in localStorage. In the icon-only collapsed sidebar the
 * header/chevron hide and items always show (handled in globals.css).
 */
export function NavGroup({ label, children, defaultOpen = true }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  // Start from defaultOpen so SSR + first client render match (no hydration
  // mismatch); apply the persisted preference after mount.
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const v = localStorage.getItem(`navgroup:${label}`);
      if (v === "0") setOpen(false);
      else if (v === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, [label]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`navgroup:${label}`, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className={`nav-group${open ? "" : " collapsed"}`}>
      <button type="button" className="nav-group-head" onClick={toggle} aria-expanded={open}>
        <span className="nav-group-label">{label}</span>
        <span className="chev" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      <div className="nav-group-items">{children}</div>
    </div>
  );
}
