"use client";

import { useEffect, useState } from "react";
import { IconPanelLeft } from "./icons";

/**
 * Toggles the desktop sidebar between full and icon-only. State lives on
 * <html data-sidebar-collapsed> and persists in localStorage. An inline script
 * in the layout applies the attribute before paint to avoid a flash, so this
 * component only needs to read/flip it. On mobile the same button opens the
 * CSS-only drawer (the <label htmlFor="nav-toggle"> sibling handles that).
 */
export function SidebarCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebarCollapsed === "1");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.dataset.sidebarCollapsed = next ? "1" : "0";
    try {
      localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label="Toggle sidebar"
    >
      <IconPanelLeft size={18} />
    </button>
  );
}
