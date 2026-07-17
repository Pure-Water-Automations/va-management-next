"use client";

// Task 3A — client-side sort/filter over the already-loaded pipeline (no server
// change). The row markup mirrors the former server render; the interactive
// children (ScreeningPanel/RecruiterWorkflow/ApplicationDetails) are client
// components rendered here directly. Bulk stage-move stays backlog.

import { useMemo, useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/Badge";
import { ApplicationDetails } from "@/components/ApplicationDetails";
import { ScreeningPanel } from "@/components/ScreeningPanel";
import { RecruiterWorkflow } from "@/components/RecruiterWorkflow";

export type PipelineCandidate = {
  candidateId: string;
  name: string | null;
  email: string;
  skillsRoleTags: string | null;
  applicationJson: unknown;
  source: string | null;
  screenVerdict: string | null;
  screenScore: number | null;
  screenSummary: string | null;
  screenFlags: unknown;
  screenedAtIso: string | null;
  createdAtIso: string;
  currentStage: string;
  timezone: string | null;
  dupCount: number;
};

type Sort = "applied" | "score" | "name";

const chip = (active: boolean): CSSProperties => ({
  padding: "4px 11px",
  borderRadius: 9999,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid var(--color-border)",
  background: active ? "var(--color-navy-900,#132272)" : "var(--color-surface,#fff)",
  color: active ? "#fff" : "var(--color-text-secondary,#666)",
});
const selectStyle: CSSProperties = { padding: "5px 9px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12.5 };

export function PipelineClient({
  candidates,
  stageLabel,
  hasLink,
  canRecruit,
  canDecide,
  canGate,
}: {
  candidates: PipelineCandidate[];
  stageLabel: Record<string, string>;
  hasLink: boolean;
  canRecruit: boolean;
  canDecide: boolean;
  canGate: boolean;
}) {
  const [sort, setSort] = useState<Sort>("applied");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [tzFilter, setTzFilter] = useState<string>("");

  // Distinct timezones actually present, for the filter select.
  const timezones = useMemo(
    () => [...new Set(candidates.map((c) => c.timezone).filter((t): t is string => !!t))].sort(),
    [candidates],
  );
  const stages = useMemo(
    () => [...new Set(candidates.map((c) => c.currentStage))].sort((a, b) => (stageLabel[a] ?? a).localeCompare(stageLabel[b] ?? b)),
    [candidates, stageLabel],
  );

  const shown = useMemo(() => {
    let rows = candidates;
    if (stageFilter) rows = rows.filter((c) => c.currentStage === stageFilter);
    if (tzFilter) rows = rows.filter((c) => c.timezone === tzFilter);
    const sorted = [...rows];
    if (sort === "applied") sorted.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
    else if (sort === "score") sorted.sort((a, b) => (b.screenScore ?? -1) - (a.screenScore ?? -1));
    else sorted.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
    return sorted;
  }, [candidates, stageFilter, tzFilter, sort]);

  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg-secondary)",
        }}
      >
        <span className="small" style={{ fontWeight: 600 }}>Sort</span>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={chip(sort === "applied")} onClick={() => setSort("applied")}>Applied ↓</span>
          <span style={chip(sort === "score")} onClick={() => setSort("score")}>AI score</span>
          <span style={chip(sort === "name")} onClick={() => setSort("name")}>Name</span>
        </div>
        <select style={selectStyle} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">All stages</option>
          {stages.map((s) => <option key={s} value={s}>{stageLabel[s] ?? s}</option>)}
        </select>
        {timezones.length > 0 && (
          <select style={selectStyle} value={tzFilter} onChange={(e) => setTzFilter(e.target.value)}>
            <option value="">All timezones</option>
            {timezones.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <span className="small" style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }}>
          {shown.length} of {candidates.length}
        </span>
      </div>

      <div>
        {shown.length === 0 ? (
          <div style={{ padding: 24, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No candidates match these filters.</div>
        ) : (
          shown.map((c) => (
            <div key={c.candidateId} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--color-border-subtle)" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{c.name ?? c.email}</div>
                <div className="small">{c.email}{c.skillsRoleTags ? ` · ${c.skillsRoleTags}` : ""}</div>
                <ApplicationDetails answers={c.applicationJson} />
                {c.source === "native_form" && (
                  <ScreeningPanel candidateId={c.candidateId} verdict={c.screenVerdict} score={c.screenScore} summary={c.screenSummary} flags={c.screenFlags} screenedAt={c.screenedAtIso ? new Date(c.screenedAtIso) : null} canScreen={canRecruit} />
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="small">Applied {new Date(c.createdAtIso).toLocaleDateString()}</span>
                  <ApplicationBadges applicationJson={c.applicationJson} />
                  {c.dupCount > 1 && <Badge variant="warning" size="sm">⚠ applied {c.dupCount}x</Badge>}
                  <Badge variant="info">{stageLabel[c.currentStage] ?? c.currentStage}</Badge>
                </div>
                <RecruiterWorkflow candidateId={c.candidateId} name={c.name} email={c.email} stage={c.currentStage} hasVideoOrBookingLink={hasLink} canRecruit={canRecruit} canDecide={canDecide} canGate={canGate} />
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function ApplicationBadges({ applicationJson }: { applicationJson: unknown }) {
  if (!applicationJson || typeof applicationJson !== "object") return null;
  const a = applicationJson as Record<string, unknown>;
  const referralSource = typeof a.referralSource === "string" ? a.referralSource.trim() : "";
  const ffwpu = typeof a.ffwpuAffiliated === "string" ? a.ffwpuAffiliated.trim().toLowerCase() : "";
  if (!referralSource && ffwpu !== "yes") return null;
  return (
    <>
      {referralSource && (
        <span title={referralSource}>
          <Badge variant="default" size="sm">📌 {referralSource.length > 28 ? `${referralSource.slice(0, 28)}…` : referralSource}</Badge>
        </span>
      )}
      {ffwpu === "yes" && <Badge variant="primary" size="sm" style={{ background: "var(--color-navy-100)" }}>FFWPU</Badge>}
    </>
  );
}
