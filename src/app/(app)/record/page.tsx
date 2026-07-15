import { notFound } from "next/navigation";
import { getCurrentUser, isRecordingsVisible } from "@/lib/auth/access";
import { listVisibleRecordings } from "@/lib/reads/recordings";
import { Recorder } from "@/components/recorder/Recorder";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { r2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

function fmt(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Gated by isRecordingsVisible() — see docs/recordings-feature.md.
// Library lives nested here (not a separate top-nav item) to keep the nav lean.
export default async function RecordPage() {
  const user = await getCurrentUser();
  if (!isRecordingsVisible(user)) notFound();

  const storageOk = r2Configured();
  const recs = await listVisibleRecordings(user, { scope: "all" });

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
            Recordings
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

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "32px 0 14px" }}>
        Your recordings
      </h2>
      {recs.length === 0 ? (
        <Card>
          <p className="small">No recordings yet. Use the recorder above to capture your first one.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
          {recs.map((rec) => (
            <a key={rec.id} href={`/recordings/${rec.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <Card padding={0} style={{ overflow: "hidden", height: "100%" }}>
                <div
                  style={{
                    aspectRatio: "16 / 9",
                    background: "#0b1220",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {rec.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={rec.thumbnailUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "var(--text-sm)" }}>
                      {rec.status === "ready" ? "No preview" : rec.status}
                    </span>
                  )}
                  <span
                    style={{
                      position: "absolute",
                      right: 8,
                      bottom: 8,
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      borderRadius: 4,
                      padding: "1px 6px",
                      fontSize: "var(--text-xs)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(rec.durationSec)}
                  </span>
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: 4 }}>{rec.title}</div>
                  <div className="small" style={{ color: "var(--color-text-tertiary)", marginBottom: 8 }}>
                    {rec.createdAt.toLocaleDateString()}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {rec.status !== "ready" && <Badge variant="warning">{rec.status}</Badge>}
                    {rec.project && <Badge variant="primary">{rec.project}</Badge>}
                    {rec.reviewStatus === "flagged" && <Badge variant="danger">flagged</Badge>}
                    {rec.reviewStatus === "reviewed" && <Badge variant="success">reviewed</Badge>}
                  </div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
