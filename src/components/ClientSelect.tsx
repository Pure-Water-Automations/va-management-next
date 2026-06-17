"use client";

import { useState } from "react";

const NEW = "__new_client__";

const baseStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "10px 12px",
  font: "inherit",
  background: "var(--color-surface)",
  width: "100%",
  boxSizing: "border-box",
};

/**
 * Client picker: a dropdown of clients synced one-way from Notion, plus
 * "PWA Internal" for internal work and a "+ New client…" option that reveals a
 * free-text input. Controlled — stores the chosen client name as a plain string.
 */
export function ClientSelect({
  value,
  onChange,
  clients,
}: {
  value: string;
  onChange: (v: string) => void;
  clients: string[];
}) {
  const known = new Set<string>(["", "PWA Internal", ...clients]);
  const [custom, setCustom] = useState<boolean>(!!value && !known.has(value));

  if (custom) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={baseStyle}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="New client name"
          autoFocus
        />
        <button
          type="button"
          title="Pick from list instead"
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-input)",
            background: "var(--color-surface)",
            padding: "0 12px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ↩
        </button>
      </div>
    );
  }

  return (
    <select
      style={baseStyle}
      value={known.has(value) ? value : ""}
      onChange={(e) => {
        const v = e.target.value;
        if (v === NEW) {
          setCustom(true);
          onChange("");
        } else {
          onChange(v);
        }
      }}
    >
      <option value="">— No client —</option>
      <option value="PWA Internal">PWA Internal</option>
      {clients.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={NEW}>+ New client…</option>
    </select>
  );
}
