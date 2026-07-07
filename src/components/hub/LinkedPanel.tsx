"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import type { LinkedItem, LinkOption } from "@/lib/reads/links";

/**
 * Hub right rail (design: "Linked" + "Backlinks"): polymorphic links to SOPs,
 * tasks, recordings, and client orgs, with a "+ Link anything" picker.
 * Creating a link automatically shows as a backlink on the other side.
 */
export function LinkedPanel({
  fromType,
  fromId,
  links,
  backlinks,
  options,
  canEdit,
}: {
  fromType: string;
  fromId: string;
  links: LinkedItem[];
  backlinks: LinkedItem[];
  options: LinkOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function link(o: LinkOption) {
    if (busy) return;
    setBusy(true);
    const res = await postAction("/api/hr/links", {
      fromType,
      fromId,
      toType: o.type,
      toId: o.id,
      label: o.label,
    });
    setBusy(false);
    setPickerOpen(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to link");
      return;
    }
    router.refresh();
  }

  async function unlink(linkId: string) {
    const res = await postAction("/api/hr/links/delete", { linkId });
    if (!res.ok) {
      window.alert(res.error ?? "Failed to unlink");
      return;
    }
    router.refresh();
  }

  const card: React.CSSProperties = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 20,
    boxShadow: "var(--shadow-sm)",
    padding: "16px 18px",
    marginBottom: 14,
  };
  const heading: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    fontWeight: 700,
    letterSpacing: ".12em",
    textTransform: "uppercase",
    color: "var(--color-text-tertiary)",
    marginBottom: 8,
  };
  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    margin: "0 -8px",
    borderRadius: 10,
    fontSize: "var(--text-sm)",
    color: "var(--color-text-primary)",
    textDecoration: "none",
  };

  return (
    <div style={{ position: "sticky", top: 90 }}>
      <div style={card}>
        <div style={heading}>Linked</div>
        {links.length === 0 && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>
            Nothing linked yet.
          </p>
        )}
        {links.map((l) => (
          <div key={l.linkId} style={{ display: "flex", alignItems: "center" }}>
            <a href={l.href} style={{ ...row, flex: 1, minWidth: 0 }}>
              <span style={{ flex: "none" }}>{l.icon}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.label}
              </span>
              <span style={{ flex: "none", opacity: 0.5 }}>↗</span>
            </a>
            {canEdit && (
              <button
                onClick={() => void unlink(l.linkId)}
                title="Unlink"
                style={{ border: "none", background: "none", color: "var(--color-text-tertiary)", cursor: "pointer", padding: "0 2px" }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              style={{
                marginTop: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 28,
                padding: "0 12px",
                borderRadius: 999,
                border: "1px dashed var(--color-sky-400, #4DC4E8)",
                background: "transparent",
                color: "var(--color-sky-600, #1d9cc7)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Link anything
            </button>
            {pickerOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 36,
                  right: 0,
                  zIndex: 50,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 16,
                  boxShadow: "var(--shadow-lg)",
                  padding: 8,
                  width: 260,
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                {options.length === 0 && (
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", padding: 8, margin: 0 }}>
                    Everything nearby is already linked.
                  </p>
                )}
                {options.map((o) => (
                  <button
                    key={`${o.type}:${o.id}`}
                    onClick={() => void link(o)}
                    disabled={busy}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 9px",
                      border: "none",
                      borderRadius: 10,
                      background: "none",
                      cursor: "pointer",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    <span style={{ flex: "none" }}>{o.icon}</span>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {o.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={heading}>Backlinks</div>
        {backlinks.length === 0 && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", margin: 0 }}>
            Nothing links here yet.
          </p>
        )}
        {backlinks.map((l) => (
          <a key={l.linkId} href={l.href} style={row}>
            <span style={{ flex: "none", opacity: 0.6 }}>↩</span>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {l.label}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
