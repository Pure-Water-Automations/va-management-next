import { notFound } from "next/navigation";
import { getCurrentUser, isBetaVisible } from "@/lib/auth/access";
import { Recorder } from "@/components/recorder/Recorder";
import { Card } from "@/components/ui/Card";
import { r2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

// Admin-only while the feature is in preview (see docs/recordings-feature.md).
export default async function RecordPage() {
  const user = await getCurrentUser();
  if (!(await isBetaVisible(user.email))) notFound();

  const storageOk = r2Configured();

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--color-text-tertiary)",
              marginBottom: 8,
            }}
          >
            <span style={{ width: 18, height: 18, borderRadius: 6, background: "linear-gradient(135deg, var(--color-sky-400), var(--color-navy-900))", display: "inline-block" }} />
            <a href="/recordings" style={{ color: "inherit", textDecoration: "none" }}>Recordings</a>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-.03em", fontSize: "var(--text-3xl)", margin: 0, color: "var(--color-navy-900)" }}>
            Record
          </h1>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            background: "var(--color-glass-bg)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--color-border-subtle)",
            padding: "7px 13px",
            borderRadius: "var(--radius-full)",
            boxShadow: "var(--shadow-xs)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: storageOk ? "var(--color-success)" : "var(--color-warning)" }} />
          {storageOk ? "Storage connected" : "Storage not configured"}
        </div>
      </div>

      {!storageOk && (
        <Card variant="outline" style={{ marginBottom: 16 }}>
          <p className="small">
            Video storage isn&apos;t configured yet — set the <code>R2_*</code> environment variables to enable saving.
            The recorder below still works for testing capture.
          </p>
        </Card>
      )}

      <Recorder />
    </div>
  );
}
