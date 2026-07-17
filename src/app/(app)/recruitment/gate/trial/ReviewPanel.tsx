"use client";

// Structured Rubric Panel (doc 08 §3 Screen 6) + Final Decision Panel (Screen
// 7), combined so the 1–5 scores, the live weighted total, and the decision
// validation all share one piece of state. Client-side validation mirrors the
// server rule (validateGateReview) exactly and lists unmet criteria inline;
// the server re-validates on submit and is the source of truth.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  PASS_MIN_CORE_SCORE,
  PASS_MIN_TOTAL,
  RUBRIC_DIMENSIONS,
  rubricTotal,
  type GateDecision,
  type RubricKey,
  type RubricScores,
} from "@/lib/trial/types";
import { validateGateReview } from "@/app/api/trials/review/validate";
import type { RubricRowView } from "./view-types";

const SCORE_BUTTONS = [1, 2, 3, 4, 5] as const;

const DECISIONS: { key: GateDecision; label: string; variant: "primary" | "secondary" | "ghost" | "danger" }[] = [
  { key: "pass", label: "Pass", variant: "primary" },
  { key: "revision", label: "Request revision", variant: "secondary" },
  { key: "waitlist", label: "Waitlist", variant: "ghost" },
  { key: "close", label: "Close", variant: "danger" },
];

export function ReviewPanel({
  candidateId,
  rows,
  hasUnresolvedEscalation,
}: {
  candidateId: string;
  rows: RubricRowView[];
  hasUnresolvedEscalation: boolean;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Partial<Record<RubricKey, number>>>({});
  const [rationale, setRationale] = useState("");
  const [pending, setPending] = useState<GateDecision | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Provisional weighted total from whatever is scored so far (0 for unset).
  const { total, allScored } = useMemo(() => {
    let sum = 0;
    let scoredCount = 0;
    for (const d of RUBRIC_DIMENSIONS) {
      const v = scores[d.key];
      if (typeof v === "number") {
        sum += (v / 5) * d.weight;
        scoredCount += 1;
      }
    }
    return { total: sum, allScored: scoredCount === RUBRIC_DIMENSIONS.length };
  }, [scores]);

  function setScore(key: RubricKey, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }));
    setErrors([]);
    setServerError(null);
  }

  async function submit(decision: GateDecision) {
    setServerError(null);
    // Client mirror of the server rule — lists unmet criteria before we POST.
    const full = {} as RubricScores;
    for (const d of RUBRIC_DIMENSIONS) full[d.key] = scores[d.key] ?? Number.NaN;
    const result = validateGateReview(
      { candidateId, decision, rationale, rubricScores: full },
      { hasUnresolvedEscalation },
    );
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setPending(decision);
    const res = await postAction("/api/trials/review", {
      candidateId,
      decision,
      rationale,
      rubricScores: full,
    });
    setPending(null);
    if (!res.ok) {
      // Prefer the structured unmet list the route returns, else the message.
      const unmet = (res as { unmet?: string[] }).unmet;
      if (Array.isArray(unmet) && unmet.length) setErrors(unmet);
      setServerError(res.error ?? "Decision failed.");
      return;
    }
    // The review route returns the contract shape { ok, newStage } directly.
    const newStage = (res as { newStage?: string }).newStage;
    setDone(`Decision recorded — candidate moved to “${newStage ?? "updated"}”.`);
    router.refresh();
  }

  const passPreview = allScored
    ? total >= PASS_MIN_TOTAL &&
      RUBRIC_DIMENSIONS.every((d) => !d.core || (scores[d.key] ?? 0) >= PASS_MIN_CORE_SCORE) &&
      !hasUnresolvedEscalation
    : false;

  return (
    <div>
      {/* ── Rubric grid ─────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 620 }}>
          {rows.map((row) => (
            <div
              key={row.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: "1px solid var(--color-border-subtle)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                  {row.label}{" "}
                  <span className="small" style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>
                    · {row.weight}%{row.core ? " · core" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                  <Badge variant="default" size="sm">
                    {row.evidenceCount} {row.evidenceCount === 1 ? "event" : "events"}
                  </Badge>
                  {typeof row.aiSuggested === "number" && (
                    <Badge variant="info" size="sm">AI suggests {row.aiSuggested}</Badge>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {SCORE_BUTTONS.map((n) => {
                  const active = scores[row.key] === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(row.key, n)}
                      aria-pressed={active}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "var(--radius-md)",
                        cursor: "pointer",
                        fontSize: "var(--text-sm)",
                        fontWeight: 600,
                        border: active ? "1.5px solid var(--color-navy-800)" : "1px solid var(--color-border)",
                        background: active ? "var(--color-navy-800)" : "var(--color-surface)",
                        color: active ? "#fff" : "var(--color-text-secondary)",
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div style={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }} className="small">
                {typeof scores[row.key] === "number"
                  ? `${(((scores[row.key] as number) / 5) * row.weight).toFixed(1)}`
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Live total ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
          padding: "12px 16px",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-bg-secondary)",
        }}
      >
        <div>
          <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700 }}>
            Weighted total
          </div>
          <div className="small" style={{ color: "var(--color-text-tertiary)" }}>
            Pass requires ≥ {PASS_MIN_TOTAL} and ≥ {PASS_MIN_CORE_SCORE} on every core dimension.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {total.toFixed(1)}<span className="small" style={{ fontWeight: 400 }}> / 100</span>
          </div>
          {allScored && (
            <Badge variant={passPreview ? "success" : "warning"}>
              {passPreview ? "Meets pass bar" : "Below pass bar"}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Decision ────────────────────────────────────────────────── */}
      <div style={{ marginTop: 20 }}>
        <label style={{ display: "block", fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: 6 }}>
          Rationale <span style={{ color: "var(--color-error)" }}>*</span>
          <span className="small" style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}> — evidence-based; required for every decision</span>
        </label>
        <textarea
          value={rationale}
          onChange={(e) => {
            setRationale(e.target.value);
            setErrors([]);
            setServerError(null);
          }}
          rows={4}
          placeholder="Summarize strengths, developmental needs, and a suggested specialization track…"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            resize: "vertical",
            background: "var(--color-surface)",
            color: "var(--color-text-primary)",
          }}
        />

        {hasUnresolvedEscalation && (
          <div style={{ marginTop: 10 }}>
            <Badge variant="danger" dot>Unresolved human escalation — blocks a pass until answered</Badge>
          </div>
        )}

        {errors.length > 0 && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: "var(--radius-lg)",
              background: "var(--color-error-light)",
              border: "1px solid rgba(240,76,76,0.22)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--color-error-dark)", marginBottom: 6 }}>
              Unmet criteria
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--color-error-dark)", fontSize: "var(--text-sm)" }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {serverError && !errors.length && (
          <div className="small" style={{ marginTop: 10, color: "var(--color-error-dark)" }}>{serverError}</div>
        )}

        {done ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: "var(--radius-lg)",
              background: "var(--color-success-light)",
              color: "var(--color-success-dark)",
              fontWeight: 600,
              fontSize: "var(--text-sm)",
            }}
          >
            {done}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {DECISIONS.map((d) => (
              <Button
                key={d.key}
                variant={d.variant}
                loading={pending === d.key}
                disabled={pending !== null}
                onClick={() => submit(d.key)}
              >
                {d.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
