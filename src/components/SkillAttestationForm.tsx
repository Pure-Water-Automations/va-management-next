"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

export function SkillAttestationForm({ vaId, skillOptions, current }: { vaId: string; skillOptions: string[]; current: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(current));
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function toggle(skill: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill); else next.add(skill);
      return next;
    });
  }

  async function submit() {
    if (picked.size === 0) { setError("Select at least one skill you're certifying."); return; }
    setError("");
    setLoading(true);
    const res = await postAction("/api/va/skill-attestation", { vaId, skills: Array.from(picked) });
    setLoading(false);
    if (!res.ok) { setError(res.error ?? "Submit failed"); return; }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return <div style={{ padding: 14, color: "var(--color-success-dark)", background: "var(--color-success-light)", borderRadius: "var(--radius-lg)" }}>Thanks — your skills were submitted and your tier review is now with HR.</div>;
  }

  return (
    <div>
      <p className="small" style={{ marginTop: 0, marginBottom: 12 }}>
        Select all the skills you&apos;ve mastered and are certifying for this tier review.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
        {skillOptions.map((skill) => {
          const on = picked.has(skill);
          return (
            <button
              key={skill}
              onClick={() => toggle(skill)}
              style={{
                textAlign: "left",
                border: `1.5px solid ${on ? "var(--color-navy-700, #132272)" : "var(--color-border)"}`,
                background: on ? "var(--color-sky-50)" : "var(--color-surface)",
                borderRadius: 10,
                padding: "9px 12px",
                cursor: "pointer",
                fontSize: "var(--text-sm)",
                fontWeight: on ? 700 : 400,
                color: "var(--color-navy-900)",
              }}
            >
              {on ? "✓ " : ""}{skill}
            </button>
          );
        })}
      </div>
      {error && <div style={{ color: "var(--color-error, #b42318)", fontSize: "var(--text-sm)", marginTop: 10 }}>{error}</div>}
      <div style={{ marginTop: 14 }}>
        <Button onClick={submit} loading={loading} disabled={loading} variant="primary">Submit attestation</Button>
      </div>
    </div>
  );
}
