import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { getClientRecording } from "@/lib/reads/client-recordings";
import { Avatar } from "@/components/Avatar";
import { ClientRecordingComment } from "@/components/client/ClientRecordingComment";
import { IconChevronRight, IconSparkles } from "@/components/icons";

export const dynamic = "force-dynamic";

function fmtClock(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function ClientRecordingPlayer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const rec = await getClientRecording(membership.clientOrganizationId, id);
  if (!rec) notFound();

  return (
    <div className="dash-stage" style={{ maxWidth: 820, margin: "0 auto" }}>
      <a href="/client/recordings" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)", marginBottom: 14, transform: "scaleX(-1)" }}>
        <IconChevronRight size={14} />
        <span style={{ transform: "scaleX(-1)" }}>All videos</span>
      </a>

      <div className="surface" style={{ overflow: "hidden", borderRadius: "var(--radius-card)" }}>
        <div style={{ position: "relative", aspectRatio: "16/9", background: "#0b1220" }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={`/api/recordings/stream/${rec.id}`} controls playsInline style={{ width: "100%", height: "100%", display: "block", background: "#0b1220" }} />
        </div>

        <div style={{ padding: "22px 26px 26px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: "0 0 7px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-xl)", letterSpacing: "-.02em", color: "var(--color-navy-900)" }}>{rec.title}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar name={rec.presenter} size={24} />
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                  {rec.presenter} · {rec.createdAt.toLocaleDateString()}
                  {rec.durationSec ? ` · ${fmtClock(rec.durationSec)}` : ""}
                </span>
              </div>
            </div>
          </div>

          {rec.aiSummary && (
            <div style={{ borderRadius: "var(--radius-md)", padding: "16px 18px", background: "linear-gradient(135deg, var(--color-sky-50), #eef0fa)", border: "1px solid var(--color-sky-100)", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <span style={{ color: "var(--color-sky-600)", display: "flex" }}><IconSparkles size={15} /></span>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-sky-700)" }}>AI summary</span>
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{rec.aiSummary}</p>
            </div>
          )}

          {rec.transcriptJson && rec.transcriptJson.length > 0 && (
            <details style={{ marginBottom: 20 }}>
              <summary style={{ cursor: "pointer", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 11 }}>
                Transcript
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10, maxHeight: 320, overflowY: "auto" }}>
                {rec.transcriptJson.map((seg, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
                    <span style={{ flex: "none", width: 44, color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums", fontSize: "var(--text-xs)", paddingTop: 2 }}>{fmtClock(seg.start)}</span>
                    <span style={{ color: "var(--color-text-secondary)" }}>{seg.text}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 11 }}>
            Comments
          </div>
          {rec.comments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              {rec.comments.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 10 }}>
                  <Avatar name={c.authorName ?? "Team"} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
                      <strong style={{ fontWeight: 600 }}>{c.authorName ?? "Team"}</strong>
                      {c.reaction ? ` ${c.reaction}` : ""} {c.body ? <span style={{ color: "var(--color-text-secondary)" }}>{c.body}</span> : null}
                    </div>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>{c.createdAt.toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ClientRecordingComment recordingId={rec.id} />
        </div>
      </div>
    </div>
  );
}
