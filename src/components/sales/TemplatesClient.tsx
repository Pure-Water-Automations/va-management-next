"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Chip, cardStyle, useToast } from "@/components/sales/ui";
import type { EmailTemplateRow } from "@/lib/reads/sales-console";

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/sales/console", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

const CATS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "discovery", label: "Discovery" },
  { key: "proposal", label: "Proposal" },
  { key: "payment", label: "Payment" },
  { key: "checkin", label: "Check-in" },
  { key: "upgrade", label: "Upgrade" },
  { key: "reengage", label: "Re-engage" },
  { key: "testimonial", label: "Testimonial" },
  { key: "referral", label: "Referral" },
];

function catLabel(cat: string): string {
  return CATS.find((c) => c.key === cat)?.label ?? cat;
}

export function TemplatesClient({ templates: initial }: { templates: EmailTemplateRow[] }) {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>(initial);
  const [cat, setCat] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);
  const [toastNode, showToast] = useToast();

  const shown = useMemo(() => (cat === "all" ? templates : templates.filter((t) => t.cat === cat)), [templates, cat]);

  async function copy(t: EmailTemplateRow) {
    try {
      await navigator.clipboard.writeText(`${t.title}\n\n${t.body}`);
    } catch {
      showToast("Couldn't reach the clipboard.");
      return;
    }
    setCopiedId(t.id);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedId(null), 1800);
    showToast("Template copied to clipboard.");
  }

  function startEdit(t: EmailTemplateRow) {
    setEditingId(t.id);
    setDraft(t.body);
  }

  async function save(t: EmailTemplateRow) {
    const body = draft;
    setTemplates((p) => p.map((x) => (x.id === t.id ? { ...x, body } : x)));
    setEditingId(null);
    showToast("Template saved.");
    const res = await call({ op: "template_save", id: t.id, body });
    if (!res.ok) showToast(res.error || "Save failed.");
  }

  return (
    <div>
      <div style={{ display: "inline-flex", background: "var(--color-bg-tertiary,#e8e8ed)", borderRadius: 9999, padding: 3, marginBottom: 18, flexWrap: "wrap" }}>
        {CATS.map((c) => (
          <button key={c.key} type="button" onClick={() => setCat(c.key)} style={tabBtn(cat === c.key)}>{c.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 14 }}>
        {shown.length === 0 && <p className="small">No templates in this category yet.</p>}
        {shown.map((t) => {
          const editing = editingId === t.id;
          return (
            <div key={t.id} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-navy-900,#132272)" }}>{t.title}</span>
                <Chip bg="#e7f8fd" fg="#157ba0">{catLabel(t.cat)}</Chip>
              </div>
              {t.purpose && <div style={{ fontSize: 12, color: "var(--color-text-tertiary,#98989d)" }}>{t.purpose}</div>}
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={9}
                  style={{ border: "1px solid var(--color-sky-400,#4dc4e8)", borderRadius: 10, padding: "10px 12px", font: "inherit", fontSize: 13, width: "100%", resize: "vertical", outline: "none" }}
                />
              ) : (
                <div style={{ background: "var(--color-bg-secondary,#f5f5f7)", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "var(--color-text-secondary,#666)", whiteSpace: "pre-line", maxHeight: 180, overflowY: "auto" }}>
                  {t.body}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                {editing ? (
                  <>
                    <button type="button" onClick={() => setEditingId(null)} style={ghostBtn}>Cancel</button>
                    <button type="button" onClick={() => void save(t)} style={solidBtn}>Save</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => startEdit(t)} style={ghostBtn}>Edit</button>
                    <button type="button" onClick={() => void copy(t)} style={ghostBtn}>{copiedId === t.id ? "Copied ✓" : "Copy"}</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toastNode}
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────
const tabBtn = (active: boolean): CSSProperties => ({ border: "none", borderRadius: 9999, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: active ? "var(--color-surface,#fff)" : "transparent", color: active ? "var(--color-navy-900,#132272)" : "var(--color-text-secondary,#666)", boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none" });
const ghostBtn: CSSProperties = { border: "1px solid var(--color-border,#d2d2d7)", borderRadius: 9999, padding: "7px 14px", background: "var(--color-surface,#fff)", color: "var(--color-navy-900,#132272)", fontWeight: 600, fontSize: 12, cursor: "pointer" };
const solidBtn: CSSProperties = { border: "none", borderRadius: 9999, padding: "7px 14px", background: "var(--color-navy-900,#132272)", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" };
