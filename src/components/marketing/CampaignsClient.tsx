"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/sales/ui";
import { compactMoney } from "@/lib/sales/packages";
import type { CampaignRow } from "@/lib/reads/marketing";
import {
  callMarketing, CampaignStatusChip, ChannelChip, Drawer,
  STAGE_DOT, STAGE_LABEL, dealValueLabel, solidBtn, inputStyle,
} from "@/components/marketing/common";

const CHANNELS = ["Facebook", "Email", "Event", "Website", "Partners"];

const cardBase: CSSProperties = {
  background: "var(--color-surface, #fff)",
  border: "1px solid var(--color-border-subtle, #e8e8ed)",
  borderRadius: 16,
  padding: 18,
  cursor: "pointer",
  transition: "box-shadow 0.15s ease, transform 0.15s ease",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

/** Keep the drawer-open state addressable (?campaign=<id>) without navigating. */
function syncUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("campaign", id);
  else url.searchParams.delete("campaign");
  window.history.replaceState(null, "", url.toString());
}

export function CampaignsClient({ campaigns, initialOpenId }: { campaigns: CampaignRow[]; initialOpenId: string | null }) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [rows, setRows] = useState<CampaignRow[]>(campaigns);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("Facebook");
  const [busy, setBusy] = useState(false);

  useEffect(() => setRows(campaigns), [campaigns]);

  const open = openId ? rows.find((c) => c.id === openId) ?? null : null;

  function setOpen(id: string | null) {
    setOpenId(id);
    syncUrl(id);
  }

  async function create() {
    if (!name.trim()) { showToast("Name the campaign first."); return; }
    setBusy(true);
    const res = await callMarketing({ op: "campaign_create", name: name.trim(), channel });
    setBusy(false);
    if (!res.ok) { showToast(res.error || "Could not create the campaign."); return; }
    setRows((cur) => [...cur, res.result as CampaignRow]);
    setName("");
    setChannel("Facebook");
    setShowForm(false);
    showToast("Campaign created as a draft.");
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" style={solidBtn} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New campaign"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "var(--color-surface, #fff)", border: "1px solid var(--color-border-subtle, #e8e8ed)", borderRadius: 14, padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="Campaign name, e.g. Fall pastors webinar"
            style={{ ...inputStyle, flex: 1, minWidth: 260 }}
          />
          <select value={channel} onChange={(e) => setChannel(e.target.value)} style={inputStyle}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" style={solidBtn} disabled={busy} onClick={create}>Create</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
        {rows.map((c) => (
          <div
            key={c.id}
            style={cardBase}
            onClick={() => setOpen(c.id)}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 10px 26px rgba(15,28,94,0.12)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-navy-900, #132272)" }}>{c.name}</span>
              <CampaignStatusChip status={c.status} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ChannelChip channel={c.channel} />
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary, #98989d)" }}>{c.dates}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-secondary, #6e6e73)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {c.descr}
            </div>
            <div style={{ borderTop: "1px solid var(--color-border-subtle, #e8e8ed)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--color-text-tertiary, #98989d)" }}>
              <span>
                <Num n={c.leads} /> leads · <Num n={c.won} /> won · <NumLabel label={c.openPipeline > 0 ? compactMoney(c.openPipeline) : "$0"} /> open
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-sky-600, #1e97be)", whiteSpace: "nowrap" }}>View →</span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary, #98989d)" }}>No campaigns yet — create the first one.</div>
        )}
      </div>

      {open && (
        <Drawer title={open.name} onClose={() => setOpen(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <CampaignStatusChip status={open.status} />
              <ChannelChip channel={open.channel} />
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary, #98989d)" }}>{open.dates}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary, #6e6e73)" }}>{open.descr}</div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "var(--color-navy-800, #1a278a)", background: "var(--color-navy-50, #eef0fa)", borderRadius: 8, padding: "8px 12px" }}>
              Leads tagged with source: {open.tag}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-navy-900, #132272)", marginBottom: 8 }}>
                {open.attributed.length} lead{open.attributed.length === 1 ? "" : "s"} attributed
              </div>
              {open.attributed.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--color-text-tertiary, #98989d)" }}>
                  No leads yet — share the tagged link to start attributing.
                </div>
              )}
              {open.attributed.map((d) => (
                <div
                  key={d.id}
                  onClick={() => router.push(`/sales?deal=${d.id}`)}
                  title="Open this deal in the sales pipeline"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderBottom: "1px solid var(--color-border-subtle, #e8e8ed)", cursor: "pointer", borderRadius: 8 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-sky-50, #e7f8fd)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--color-navy-900, #132272)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.orgName}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--color-text-tertiary, #98989d)" }}>{d.contactName || "—"}</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary, #6e6e73)", whiteSpace: "nowrap" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: STAGE_DOT[d.stage] ?? "#98989d", flex: "none" }} />
                    {STAGE_LABEL[d.stage] ?? d.stage}
                  </span>
                  <span style={{ width: 76, flex: "none", textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--color-navy-900, #132272)" }}>
                    {dealValueLabel(d.dealValue, d.billingType) ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Drawer>
      )}
      {toastNode}
    </div>
  );
}

function Num({ n }: { n: number }) {
  return <strong style={{ color: "var(--color-navy-900, #132272)", fontWeight: 700 }}>{n}</strong>;
}
function NumLabel({ label }: { label: string }) {
  return <strong style={{ color: "var(--color-navy-900, #132272)", fontWeight: 700 }}>{label}</strong>;
}
