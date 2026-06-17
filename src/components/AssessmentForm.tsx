"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { rubricCategories, type RubricKind } from "@/lib/services/evaluation-rubric";

const SCALE = [
  { v: 1, label: "1 · Needs improvement" },
  { v: 2, label: "2 · Below expectations" },
  { v: 3, label: "3 · Meets expectations" },
  { v: 4, label: "4 · Strong" },
  { v: 5, label: "5 · Outstanding" },
];

type Kind = "self" | "supervisor";

export function AssessmentForm({
  evaluationId,
  rubric,
  kind,
  subjectName,
}: {
  evaluationId: string;
  rubric: RubricKind;
  kind: Kind;
  subjectName?: string;
}) {
  const router = useRouter();
  const cats = rubricCategories(rubric);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comments, setComments] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const allScored = cats.every((c) => scores[c.key]);
  const ready = allScored && (kind === "self" || recommendation);

  async function submit() {
    setError("");
    if (!ready) {
      setError("Please score every category" + (kind === "supervisor" ? " and pick a recommendation." : "."));
      return;
    }
    setLoading(true);
    const numericScores: Record<string, number> = {};
    for (const c of cats) numericScores[c.key] = Number(scores[c.key]);
    const path = kind === "self" ? "/api/va/submit-self-assessment" : "/api/va/submit-supervisor-assessment";
    const res = await postAction(path, {
      evaluationId,
      scores: numericScores,
      narratives: comments.trim() ? { overall: comments.trim() } : undefined,
      ...(kind === "self" ? { portfolioUrl: portfolio.trim() || undefined } : { recommendation }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Submit failed");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div style={{ padding: 16, color: "var(--color-success-dark)", background: "var(--color-success-light)", borderRadius: "var(--radius-lg)" }}>
        Thanks — your {kind === "self" ? "self-assessment" : `assessment of ${subjectName ?? "the VA"}`} was recorded. HR will review it.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {cats.map((c) => (
        <div key={c.key} style={field}>
          <label style={label}>{c.label}</label>
          <select style={input} value={scores[c.key] ?? ""} onChange={(e) => setScores((s) => ({ ...s, [c.key]: e.target.value }))}>
            <option value="">Select a rating…</option>
            {SCALE.map((s) => (
              <option key={s.v} value={s.v}>{s.label}</option>
            ))}
          </select>
        </div>
      ))}

      {kind === "supervisor" && (
        <div style={field}>
          <label style={label}>Overall recommendation</label>
          <select style={input} value={recommendation} onChange={(e) => setRecommendation(e.target.value)}>
            <option value="">Select…</option>
            <option value="promote">Promote</option>
            <option value="hold">Hold at current level</option>
            <option value="needs_improvement">Needs improvement</option>
          </select>
        </div>
      )}

      {kind === "self" && (
        <div style={field}>
          <label style={label}>Portfolio / work sample link (optional)</label>
          <input style={input} value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="https://…" />
        </div>
      )}

      <div style={field}>
        <label style={label}>Comments {kind === "self" ? "(anything you're proud of or want to flag)" : "(context for HR)"}</label>
        <textarea style={{ ...input, minHeight: 80 }} value={comments} onChange={(e) => setComments(e.target.value)} />
      </div>

      {error && <div style={{ color: "var(--color-danger, #b42318)", fontSize: "var(--text-sm)", marginBottom: 12 }}>{error}</div>}
      <Button onClick={submit} loading={loading} disabled={loading} variant="primary">
        Submit {kind === "self" ? "self-assessment" : "assessment"}
      </Button>
    </div>
  );
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 };
const label: React.CSSProperties = { fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-tertiary)", fontWeight: 700 };
const input: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "10px 12px", font: "inherit", background: "var(--color-surface)" };
