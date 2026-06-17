"use client";

import { APPLICATION_QUESTIONS } from "@/lib/application-questions";

/** Recruiter-facing read-only view of a candidate's native application answers. */
export function ApplicationDetails({ answers }: { answers: unknown }) {
  if (!answers || typeof answers !== "object") return null;
  const a = answers as Record<string, string>;
  const rows = APPLICATION_QUESTIONS.filter((q) => (a[q.key] ?? "").toString().trim());
  if (rows.length === 0) return null;

  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--color-sky-600)", fontWeight: 600 }}>
        View application
      </summary>
      <div style={{ marginTop: 10, display: "grid", gap: 8, background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 14 }}>
        {rows.map((q) => {
          const val = a[q.key];
          const isLink = q.type === "url" || /^https?:\/\//i.test(val);
          return (
            <div key={q.key}>
              <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700 }}>{q.label}</div>
              {isLink ? (
                <a href={val} target="_blank" rel="noreferrer" style={{ color: "var(--color-sky-600)", fontSize: "var(--text-sm)", wordBreak: "break-all" }}>{val}</a>
              ) : (
                <div style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap" }}>{val}</div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
