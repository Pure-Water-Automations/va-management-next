"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { RecordingVideo } from "@/components/recorder/RecordingVideo";

type TranscriptSegment = { start: number; end: number; text: string };
type PublicRecording = {
  id: string;
  title: string;
  description: string | null;
  durationSec: number | null;
  trimStartSec: number | null;
  trimEndSec: number | null;
  thumbnailUrl: string | null;
  transcript: string | null;
  transcriptJson: TranscriptSegment[] | null;
  aiSummary: string | null;
  uploaderEmail: string | null;
  createdAt: string;
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WatchClient({ token }: { token: string }) {
  const [rec, setRec] = useState<PublicRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recordings/public/get", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setRec(res.result);
        else setError(res.error || "This link isn't available.");
      })
      .catch(() => {
        if (!cancelled) setError("This link isn't available.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px 80px" }}>
      {error && (
        <Card>
          <p className="small" style={{ margin: 0 }}>
            {error} The link may have been unshared, or the video isn&apos;t ready yet.
          </p>
        </Card>
      )}

      {!rec && !error && (
        <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
          Loading…
        </p>
      )}

      {rec && (
        <>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-.03em", fontSize: "var(--text-3xl)", margin: "0 0 6px" }}>
            {rec.title}
          </h1>
          <div className="small" style={{ color: "var(--color-text-tertiary)", marginBottom: 20 }}>
            {rec.uploaderEmail ? `Shared by ${rec.uploaderEmail} · ` : ""}
            {new Date(rec.createdAt).toLocaleDateString()}
          </div>

          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <RecordingVideo
            src={`/api/recordings/public/stream/${token}`}
            poster={rec.thumbnailUrl ?? undefined}
            controls
            playsInline
            style={{ width: "100%", borderRadius: "var(--radius-card)", background: "#000" }}
          />

          {rec.description && (
            <p style={{ marginTop: 16, fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{rec.description}</p>
          )}

          {rec.aiSummary && (
            <Card style={{ marginTop: 16 }}>
              <h3 style={{ margin: "0 0 8px" }}>Summary</h3>
              <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.6, margin: 0 }}>{rec.aiSummary}</p>
            </Card>
          )}

          {rec.transcript && (
            <Card style={{ marginTop: 16 }}>
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Transcript</summary>
                <div style={{ marginTop: 12 }}>
                  {rec.transcriptJson && rec.transcriptJson.length > 0 ? (
                    rec.transcriptJson.map((seg, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontFamily: "var(--mono, monospace)", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", flex: "none" }}>
                          {fmt(seg.start)}
                        </span>
                        <span style={{ fontSize: "var(--text-sm)" }}>{seg.text}</span>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap" }}>{rec.transcript}</p>
                  )}
                </div>
              </details>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
