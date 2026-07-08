"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/sales/ui";
import type { SocialRow } from "@/lib/reads/marketing";
import { callMarketing, PlatformChip, SocialStatusChip, fmtWhen, solidBtn, ghostBtn } from "@/components/marketing/common";

const TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "approval", label: "Needs approval" },
  { value: "scheduled", label: "Scheduled" },
  { value: "posted", label: "Posted" },
];

export function SocialQueueClient({ posts }: { posts: SocialRow[] }) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [rows, setRows] = useState<SocialRow[]>(posts);
  const [tab, setTab] = useState("all");

  useEffect(() => setRows(posts), [posts]);

  const visible = useMemo(
    () => (tab === "all" ? rows : rows.filter((p) => p.status === tab)),
    [rows, tab],
  );

  async function approve(post: SocialRow) {
    setRows((cur) => cur.map((p) => (p.id === post.id ? { ...p, status: "scheduled" } : p)));
    const res = await callMarketing({ op: "social_approve", id: post.id });
    if (!res.ok) { showToast(res.error || "Could not approve the post."); router.refresh(); return; }
    showToast(`Approved — scheduled for ${fmtWhen(post.scheduledAtISO)}.`);
    router.refresh();
  }

  async function markReady(post: SocialRow) {
    setRows((cur) => cur.map((p) => (p.id === post.id ? { ...p, status: "approval" } : p)));
    const res = await callMarketing({ op: "social_ready", id: post.id });
    if (!res.ok) { showToast(res.error || "Could not update the post."); router.refresh(); return; }
    showToast("Moved to Needs approval.");
    router.refresh();
  }

  return (
    <div>
      {/* Segmented filter tabs */}
      <div style={{ display: "inline-flex", background: "#e8e8ed", borderRadius: 9999, padding: 3, marginBottom: 16 }}>
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              style={{
                border: "none",
                borderRadius: 9999,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: active ? "var(--color-surface, #fff)" : "transparent",
                color: active ? "var(--color-navy-900, #132272)" : "var(--color-text-secondary, #6e6e73)",
                boxShadow: active ? "0 1px 4px rgba(15,28,94,0.14)" : "none",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary, #98989d)" }}>No posts in this tab.</div>
        )}
        {visible.map((p) => (
          <div
            key={p.id}
            style={{
              background: "var(--color-surface, #fff)",
              border: "1px solid var(--color-border-subtle, #e8e8ed)",
              borderRadius: 14,
              padding: "13px 16px",
              boxShadow: "0 1px 3px rgba(15,28,94,0.05)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <PlatformChip platform={p.platform} />
            <span style={{ flex: 1, minWidth: 220 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary, #1d1d1f)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.text}
              </span>
              <span style={{ display: "block", fontSize: 12, color: "var(--color-text-tertiary, #98989d)" }}>{fmtWhen(p.scheduledAtISO)}</span>
            </span>
            {p.metrics ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-success-dark, #1a7a4a)", whiteSpace: "nowrap" }}>{p.metrics}</span>
            ) : null}
            <SocialStatusChip status={p.status} />
            {p.status === "approval" && (
              <button type="button" style={solidBtn} onClick={() => approve(p)}>Approve</button>
            )}
            {(p.status === "draft" || p.status === "production") && (
              <button type="button" style={ghostBtn} onClick={() => markReady(p)}>Mark ready</button>
            )}
          </div>
        ))}
      </div>
      {toastNode}
    </div>
  );
}
