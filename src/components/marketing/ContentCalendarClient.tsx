"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Chip, useToast } from "@/components/sales/ui";
import type { ContentRow } from "@/lib/reads/marketing";
import {
  callMarketing, Drawer, TYPE_CHIPS, TypeChip,
  fmtFullDate, monthNameLong, solidBtn, inputStyle,
} from "@/components/marketing/common";

const TYPES = ["social", "email", "video", "doc", "event"];
const STATUS_OPTIONS: [string, string][] = [
  ["idea", "Idea"], ["draft", "Draft"], ["inprogress", "In progress"], ["scheduled", "Scheduled"], ["published", "Published"],
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const navBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid var(--color-border, #d2d2d7)",
  background: "var(--color-surface, #fff)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--color-navy-900, #132272)",
  padding: 0,
};

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

function syncUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("content", id);
  else url.searchParams.delete("content");
  window.history.replaceState(null, "", url.toString());
}

export function ContentCalendarClient({ items, initialOpenId, todayISO }: {
  items: ContentRow[];
  initialOpenId: string | null;
  todayISO: string;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [rows, setRows] = useState<ContentRow[]>(items);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const today = useMemo(() => new Date(todayISO), [todayISO]);

  const initialItem = initialOpenId ? items.find((i) => i.id === initialOpenId) : null;
  const initDate = initialItem ? new Date(initialItem.dateISO) : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth()); // 0-11

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("social");
  const [day, setDay] = useState("14");
  const [busy, setBusy] = useState(false);

  useEffect(() => setRows(items), [items]);

  const open = openId ? rows.find((i) => i.id === openId) ?? null : null;

  function setOpen(id: string | null) {
    setOpenId(id);
    syncUrl(id);
  }

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  const monthItems = useMemo(() => {
    const byDay = new Map<number, ContentRow[]>();
    let count = 0;
    for (const item of rows) {
      const d = new Date(item.dateISO);
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
      count++;
      const list = byDay.get(d.getDate());
      if (list) list.push(item);
      else byDay.set(d.getDate(), [item]);
    }
    return { byDay, count };
  }, [rows, viewYear, viewMonth]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const isToday = (d: number) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
  const monthLabel = monthNameLong(viewMonth);

  function openFormForDay(d: number) {
    setDay(String(d));
    setShowForm(true);
  }

  async function create() {
    if (!title.trim()) { showToast("Give it a working title."); return; }
    const rawDay = parseInt(day, 10);
    const clamped = Number.isFinite(rawDay) ? Math.min(31, Math.max(1, rawDay)) : 14;
    setBusy(true);
    const res = await callMarketing({ op: "content_create", title: title.trim(), type, day: clamped, month: viewMonth + 1, year: viewYear });
    setBusy(false);
    if (!res.ok) { showToast(res.error || "Could not add the content."); return; }
    setRows((cur) => [...cur, res.result as ContentRow]);
    setTitle("");
    setType("social");
    setDay("14");
    setShowForm(false);
    showToast(`Added to the ${monthLabel} calendar as a draft.`);
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    setRows((cur) => cur.map((i) => (i.id === id ? { ...i, status } : i)));
    const res = await callMarketing({ op: "content_status", id, status });
    if (!res.ok) { showToast(res.error || "Could not update the status."); router.refresh(); return; }
    showToast("Status updated.");
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" style={solidBtn} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New content"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "var(--color-surface, #fff)", border: "1px solid var(--color-border-subtle, #e8e8ed)", borderRadius: 14, padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="Working title…"
            style={{ ...inputStyle, flex: 1, minWidth: 240 }}
          />
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary, #6e6e73)" }}>{monthLabel}</span>
          <input
            value={day}
            onChange={(e) => setDay(e.target.value)}
            inputMode="numeric"
            style={{ ...inputStyle, width: 56, textAlign: "center" }}
          />
          <button type="button" style={solidBtn} disabled={busy} onClick={create}>Add</button>
        </div>
      )}

      {/* Toolbar: month nav + type legend */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" style={navBtn} onClick={() => shiftMonth(-1)} aria-label="Previous month"><Chevron dir="left" /></button>
          <span style={{ minWidth: 140, textAlign: "center", fontSize: 18, fontWeight: 600, fontFamily: "var(--font-display)", color: "var(--color-navy-900, #132272)" }}>
            {monthLabel} {viewYear}
          </span>
          <button type="button" style={navBtn} onClick={() => shiftMonth(1)} aria-label="Next month"><Chevron dir="right" /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {TYPES.map((t) => {
            const [bg, fg] = TYPE_CHIPS[t];
            return <Chip key={t} bg={bg} fg={fg}>{t}</Chip>;
          })}
        </div>
      </div>

      {/* Weekday header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary, #98989d)", textAlign: "center" }}>{w}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        {Array.from({ length: totalCells }, (_, cell) => {
          const dayNum = cell - firstWeekday + 1;
          const real = dayNum >= 1 && dayNum <= daysInMonth;
          if (!real) {
            return <div key={cell} style={{ minHeight: 92, borderRadius: 12, border: "1px dashed var(--color-border-subtle, #e8e8ed)", background: "transparent" }} />;
          }
          const dayItems = monthItems.byDay.get(dayNum) ?? [];
          return (
            <div
              key={cell}
              onClick={() => openFormForDay(dayNum)}
              title="Click to plan content on this day"
              style={{ minHeight: 92, borderRadius: 12, padding: "8px 8px 10px", overflow: "hidden", background: "var(--color-surface, #fff)", border: "1px solid var(--color-border-subtle, #e8e8ed)", cursor: "pointer" }}
            >
              {isToday(dayNum) ? (
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 999, background: "var(--color-sky-500, #2ab0d8)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                  {dayNum}
                </span>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary, #98989d)" }}>{dayNum}</span>
              )}
              {dayItems.map((item) => {
                const [bg, fg] = TYPE_CHIPS[item.type] ?? TYPE_CHIPS.social;
                const unfinished = item.status === "idea" || item.status === "draft";
                return (
                  <div
                    key={item.id}
                    onClick={(e) => { e.stopPropagation(); setOpen(item.id); }}
                    style={{
                      background: bg,
                      color: fg,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 7,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: 4,
                      opacity: unfinished ? 0.62 : 1,
                      border: unfinished ? `1px dashed ${fg}` : "1px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    {item.status === "published" ? "✓ " : ""}{item.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {monthItems.count === 0 && (
        <div style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-tertiary, #98989d)" }}>
          Nothing planned this month yet — click a day to add the first piece.
        </div>
      )}

      {open && (
        <Drawer title={open.title} onClose={() => setOpen(null)} width="min(460px, 92vw)" titleSize={19}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TypeChip type={open.type} />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary, #6e6e73)" }}>{fmtFullDate(open.dateISO)}</span>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary, #6e6e73)" }}>Status</span>
              <select value={open.status} onChange={(e) => setStatus(open.id, e.target.value)} style={inputStyle}>
                {STATUS_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </label>
            <div style={{ background: "var(--color-bg-secondary, #f5f5f7)", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "var(--color-text-secondary, #6e6e73)", lineHeight: 1.5 }}>
              {open.notes || "No notes yet."}
            </div>
          </div>
        </Drawer>
      )}
      {toastNode}
    </div>
  );
}
