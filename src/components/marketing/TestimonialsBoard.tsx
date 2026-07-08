"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, useToast } from "@/components/sales/ui";
import type { TestimonialRow } from "@/lib/reads/marketing";
import { callMarketing, solidBtn, ghostBtn } from "@/components/marketing/common";

const COLUMNS: { stage: string; label: string; dot: string }[] = [
  { stage: "torequest", label: "To request", dot: "#ba7517" },
  { stage: "requested", label: "Requested", dot: "#ef9f27" },
  { stage: "received", label: "Received", dot: "#2ab0d8" },
  { stage: "published", label: "Published", dot: "#30c97a" },
];

export function TestimonialsBoard({ testimonials }: { testimonials: TestimonialRow[] }) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [rows, setRows] = useState<TestimonialRow[]>(testimonials);

  useEffect(() => setRows(testimonials), [testimonials]);

  async function advance(t: TestimonialRow, stage: string, toast: string) {
    setRows((cur) => cur.map((r) => (r.id === t.id ? { ...r, stage } : r)));
    const res = await callMarketing({ op: "testimonial_advance", id: t.id, stage });
    if (!res.ok) { showToast(res.error || "Could not update the testimonial."); router.refresh(); return; }
    showToast(toast);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(230px, 1fr))", gap: 14, overflowX: "auto", alignItems: "start" }}>
      {COLUMNS.map((col) => {
        const cards = rows.filter((t) => t.stage === col.stage);
        return (
          <div key={col.stage} style={{ background: "var(--color-bg-secondary, #f5f5f7)", borderRadius: 16, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: col.dot, flex: "none" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-navy-900, #132272)" }}>{col.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--color-text-tertiary, #98989d)", background: "var(--color-surface, #fff)", borderRadius: 9999, padding: "1px 8px" }}>
                {cards.length}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cards.map((t) => (
                <div key={t.id} style={{ background: "var(--color-surface, #fff)", borderRadius: 14, padding: 14, position: "relative" }}>
                  {col.stage === "published" && (
                    <span style={{ position: "absolute", top: 12, right: 12 }}>
                      <Chip bg="#d4f5e2" fg="#1a7a4a">Live</Chip>
                    </span>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-navy-900, #132272)", paddingRight: col.stage === "published" ? 48 : 0 }}>
                    {t.org}
                  </div>
                  {(col.stage === "received" || col.stage === "published") && t.quote ? (
                    <blockquote
                      style={{
                        margin: "8px 0 0",
                        padding: "2px 0 2px 10px",
                        borderLeft: `3px solid ${col.stage === "published" ? "#30c97a" : "var(--color-sky-300, #8ed8f0)"}`,
                        fontSize: 12.5,
                        fontStyle: "italic",
                        color: "var(--color-text-secondary, #6e6e73)",
                        lineHeight: 1.45,
                      }}
                    >
                      {t.quote}
                    </blockquote>
                  ) : null}
                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary, #98989d)", marginTop: 8 }}>{t.detail}</div>
                  {col.stage === "torequest" && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={solidBtn}
                        onClick={() => advance(t, "requested", `Testimonial request sent to ${t.who || t.org} using the template.`)}
                      >
                        Send request
                      </button>
                    </div>
                  )}
                  {col.stage === "requested" && (
                    <div style={{ marginTop: 10 }}>
                      <button type="button" style={ghostBtn} onClick={() => showToast(`Gentle nudge sent to ${t.who || t.org}.`)}>
                        Nudge
                      </button>
                    </div>
                  )}
                  {col.stage === "received" && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={solidBtn}
                        onClick={() => advance(t, "published", "Published — it now shows on the sales Testimonials tab too.")}
                      >
                        Approve and publish
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {cards.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary, #98989d)", padding: "6px 4px" }}>None here.</div>
              )}
            </div>

            {col.stage === "torequest" && (
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary, #98989d)", marginTop: 10, paddingLeft: 2 }}>
                Fills automatically when a deal is won.
              </div>
            )}
          </div>
        );
      })}
      {toastNode}
    </div>
  );
}
