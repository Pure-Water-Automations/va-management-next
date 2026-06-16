import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { listVisibleRecordings } from "@/lib/reads/recordings";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

function fmt(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function RecordingsLibrary() {
  const user = await getCurrentUser();
  if (!user.isAdmin) notFound();

  const recs = await listVisibleRecordings(user, { scope: "all" });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Recordings</div>
          <h1>Recordings</h1>
        </div>
        <Button href="/record" size="sm">
          Record
        </Button>
      </div>

      {recs.length === 0 ? (
        <Card>
          <p className="small">No recordings yet. Click {`"Record"`} to capture your first one.</p>
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
    </>
  );
}
