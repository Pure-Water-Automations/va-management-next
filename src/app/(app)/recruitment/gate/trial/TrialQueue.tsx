// Skills Trial gate queue (doc 08 §3 Screen 1). Rendered on /recruitment/gate
// only when SKILLS_TRIAL_V2 is on — an additive section listing candidates with
// an active CandidateTrial, each linking to the evidence console. Self-contained
// (does its own read) so the gate page edit stays minimal.

import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const DAY_MS = 24 * 60 * 60 * 1000;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function statusChip(status: string, day: number): { label: string; variant: "info" | "success" | "warning" | "default" } {
  switch (status) {
    case "ACTIVE":
      return { label: `Active · Day ${day}`, variant: "info" };
    case "SUBMITTED":
      return { label: "Evidence ready", variant: "success" };
    case "REVISION":
      return { label: "Under revision", variant: "warning" };
    case "COMPLETED":
      return { label: "Completed", variant: "default" };
    default:
      return { label: status, variant: "default" };
  }
}

const sectionTitle: React.CSSProperties = { fontSize: "var(--text-md)", fontWeight: 700, margin: "8px 0 12px" };

export async function TrialQueue() {
  const trials = await db.candidateTrial.findMany({
    orderBy: { startDate: "desc" },
    include: {
      candidate: { select: { name: true, email: true } },
      missions: { select: { status: true } },
    },
  });

  const now = Date.now();

  return (
    <>
      <h2 style={sectionTitle}>
        Skills Trial{" "}
        <span className="small" style={{ fontWeight: 400 }}>
          ({trials.length}) — simulated work-week evidence review
        </span>
      </h2>
      {trials.length === 0 ? (
        <Card style={{ marginBottom: 28 }}>
          <div style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No candidates in a skills trial yet.</div>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, marginBottom: 28 }}>
          {trials.map((t) => {
            const name = t.candidate.name ?? t.candidate.email;
            const day = Math.max(1, Math.floor((now - t.startDate.getTime()) / DAY_MS) + 1);
            const approved = t.missions.filter((m) => m.status === "APPROVED").length;
            const total = t.missions.length || 9;
            const chip = statusChip(t.status, day);
            return (
              <Link key={t.id} href={`/recruitment/gate/trial/${t.candidateId}`} style={{ textDecoration: "none", color: "inherit" }}>
                <Card style={{ height: "100%", transition: "box-shadow var(--duration-base) var(--ease-out)" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "linear-gradient(145deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "var(--text-sm)",
                        flexShrink: 0,
                      }}
                    >
                      {initials(name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "var(--text-base)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                      <div className="small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.candidate.email}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <Badge variant={chip.variant}>{chip.label}</Badge>
                    <span className="small" style={{ fontWeight: 600 }}>{approved}/{total} approved</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
