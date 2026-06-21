"use client";

import { IconSearch } from "./icons";

/** Opens the global CommandPalette (which also listens for ⌘K / a custom event). */
export function SearchPill({ placeholder = "Search…" }: { placeholder?: string }) {
  function open() {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }
  return (
    <button type="button" className="search-pill" onClick={open}>
      <IconSearch size={16} />
      <span>{placeholder}</span>
      <span className="kbd">⌘K</span>
    </button>
  );
}
