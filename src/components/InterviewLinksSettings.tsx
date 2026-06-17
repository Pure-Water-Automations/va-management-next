"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

export function InterviewLinksSettings({ bookingUrl, videoUrl }: { bookingUrl: string; videoUrl: string }) {
  const router = useRouter();
  const [booking, setBooking] = useState(bookingUrl);
  const [video, setVideo] = useState(videoUrl);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const configured = Boolean(bookingUrl || videoUrl);

  async function save() {
    setBusy(true);
    setSaved(false);
    const res = await postAction("/api/recruitment/links", { bookingUrl: booking.trim(), videoUrl: video.trim() });
    setBusy(false);
    if (!res.ok) { window.alert(res.error ?? "Failed to save"); return; }
    setSaved(true);
    router.refresh();
  }

  return (
    <details style={{ marginBottom: 20 }} open={!configured}>
      <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-700, #1a6a8a)" }}>
        Interview links {configured ? "✓" : "— set these to enable the interview invite"}
      </summary>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12, background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 14 }}>
        <label style={field}>
          <span style={lab}>Intro video link</span>
          <input style={inp} value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://… (Loom, YouTube)" />
        </label>
        <label style={field}>
          <span style={lab}>Interview booking link</span>
          <input style={inp} value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="https://… (Calendly, form, video-interview tool)" />
        </label>
        <Button size="sm" variant="secondary" loading={busy} disabled={busy} onClick={save}>Save links</Button>
        {saved && <span style={{ color: "var(--color-success-dark)", fontSize: "var(--text-sm)", fontWeight: 600 }}>Saved ✓</span>}
      </div>
    </details>
  );
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 240 };
const lab: React.CSSProperties = { fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700 };
const inp: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "8px 10px", font: "inherit", fontSize: "var(--text-sm)" };
