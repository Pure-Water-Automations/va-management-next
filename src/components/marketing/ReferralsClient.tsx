"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, StatCard, StatGrid, useToast } from "@/components/sales/ui";
import { compactMoney } from "@/lib/sales/packages";
import type { ReferrerRow } from "@/lib/reads/marketing";
import { callMarketing, fmtDayLabel, solidBtn, ghostBtn } from "@/components/marketing/common";

function KindChip({ kind }: { kind: string }) {
  const map: Record<string, [string, string]> = {
    Client: ["#d4f5e2", "#1a7a4a"],
    Champion: ["#fff3d4", "#966200"],
  };
  const [bg, fg] = map[kind] ?? ["#e7f8fd", "#157ba0"];
  return <Chip bg={bg} fg={fg}>{kind}</Chip>;
}

export function ReferralsClient({ referrers, openReferralPipeline }: { referrers: ReferrerRow[]; openReferralPipeline: number }) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [rows, setRows] = useState<ReferrerRow[]>(referrers);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setRows(referrers), [referrers]);

  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
  const totalWon = rows.reduce((s, r) => s + r.won, 0);

  async function sendThanks(r: ReferrerRow) {
    setBusy(`thanks-${r.id}`);
    const res = await callMarketing({ op: "referrer_thanks", id: r.id });
    setBusy(null);
    if (!res.ok) { showToast(res.error || "Could not queue the thank-you."); return; }
    showToast(`Thank-you email queued for ${r.name} (referral template).`);
  }

  async function logReferral(r: ReferrerRow) {
    setBusy(`log-${r.id}`);
    const nowISO = new Date().toISOString();
    setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, sent: x.sent + 1, leads: x.leads + 1, lastAtISO: nowISO } : x)));
    const res = await callMarketing({ op: "referrer_log", id: r.id });
    setBusy(null);
    if (!res.ok) { showToast(res.error || "Could not log the referral."); router.refresh(); return; }
    showToast("Referral logged — a new lead card is waiting in the sales pipeline.");
    router.refresh();
  }

  return (
    <div>
      <StatGrid>
        <StatCard label="Active referrers" value={rows.length} sub="clients and champions" />
        <StatCard label="Leads from referrals" value={totalLeads} sub="all-time" />
        <StatCard label="Won from referrals" value={totalWon} sub="became clients" />
        <StatCard hero label="Open referral pipeline" value={compactMoney(openReferralPipeline)} sub="in active deals" />
      </StatGrid>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary, #98989d)" }}>No referrers yet.</div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              background: "var(--color-surface, #fff)",
              border: "1px solid var(--color-border-subtle, #e8e8ed)",
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <span style={{ flex: 1, minWidth: 220 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-navy-900, #132272)" }}>{r.name}</span>
                <KindChip kind={r.kind} />
              </span>
              <span style={{ display: "block", fontSize: 12, color: "var(--color-text-secondary, #6e6e73)", marginTop: 3 }}>{r.note}</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary, #6e6e73)", whiteSpace: "nowrap" }}>
              {r.sent} sent · {r.leads} leads · {r.won} won
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary, #98989d)", whiteSpace: "nowrap" }}>
              Last: {r.lastAtISO ? fmtDayLabel(r.lastAtISO) : "—"}
            </span>
            <span style={{ display: "inline-flex", gap: 8 }}>
              <button type="button" style={ghostBtn} disabled={busy === `thanks-${r.id}`} onClick={() => sendThanks(r)}>
                Send thank-you
              </button>
              <button type="button" style={solidBtn} disabled={busy === `log-${r.id}`} onClick={() => logReferral(r)}>
                Log referral
              </button>
            </span>
          </div>
        ))}
      </div>
      {toastNode}
    </div>
  );
}
