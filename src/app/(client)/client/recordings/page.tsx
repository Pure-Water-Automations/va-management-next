import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { listClientRecordings } from "@/lib/reads/client-recordings";
import { Avatar } from "@/components/Avatar";
import { IconPlay, IconFilm } from "@/components/icons";

export const dynamic = "force-dynamic";

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function ClientRecordingsPage() {
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const videos = await listClientRecordings(membership.clientOrganizationId);

  return (
    <div className="dash-stage">
      <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-3xl)", letterSpacing: "-.03em", color: "var(--color-navy-900)" }}>
        Videos
      </h1>
      <p style={{ margin: "0 0 22px", fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>
        Short walkthroughs from your team — easier to follow than a long email. Each one has a summary and transcript.
      </p>

      {videos.length === 0 ? (
        <div className="surface" style={{ padding: "48px 24px", textAlign: "center" }}>
          <span style={{ display: "inline-flex", width: 52, height: 52, borderRadius: "50%", background: "var(--color-sky-50)", color: "var(--color-sky-600)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <IconFilm size={24} />
          </span>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-navy-900)", fontFamily: "var(--font-display)" }}>No videos yet</div>
          <div className="small" style={{ color: "var(--color-text-tertiary)", marginTop: 3 }}>
            When your team shares a walkthrough, it&apos;ll show up here.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
          {videos.map((v) => (
            <a key={v.id} href={`/client/recordings/${v.id}`} className="surface" style={{ overflow: "hidden", display: "block" }}>
              <div style={{ position: "relative", aspectRatio: "16/9", background: "linear-gradient(150deg, #0e1730, #0b1220 60%, #0a1a28)", display: "flex", alignItems: "center", justifyContent: "center", backgroundSize: "cover", backgroundPosition: "center", ...(v.thumbnailUrl ? { backgroundImage: `url(${v.thumbnailUrl})` } : {}) }}>
                {!v.thumbnailUrl && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 70% at 50% 40%, rgba(77,196,232,.16), transparent 70%)" }} />}
                <span style={{ position: "relative", width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,.92)", color: "var(--color-navy-900)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-md)" }}>
                  <IconPlay size={16} />
                </span>
                {v.durationSec ? (
                  <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(13,18,32,.78)", color: "#fff", fontSize: "var(--text-2xs)", fontWeight: 600, padding: "2px 7px", borderRadius: 999 }}>{fmtDuration(v.durationSec)}</span>
                ) : null}
                {v.isNew && (
                  <span style={{ position: "absolute", top: 8, left: 8, background: "var(--color-sky-400)", color: "#fff", fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 999 }}>New</span>
                )}
              </div>
              <div style={{ padding: "11px 13px" }}>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3, marginBottom: 6 }}>{v.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Avatar name={v.presenter} size={20} />
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                    {v.presenter} · {v.createdAt.toLocaleDateString()}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
