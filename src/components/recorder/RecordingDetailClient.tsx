"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { RecordingDetail } from "@/lib/reads/recordings";
import { RecordingVideo } from "@/components/recorder/RecordingVideo";

const REACTIONS = ["👍", "❤️", "🎉", "👀", "🔥"];

const label: CSSProperties = {
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--color-text-tertiary)",
  fontWeight: 700,
  marginBottom: 6,
};
const input: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "9px 11px",
  font: "inherit",
  fontSize: "var(--text-sm)",
  width: "100%",
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusVariant(status: string): "success" | "warning" | "info" | "danger" | "default" {
  if (status === "ready") return "success";
  if (status === "failed") return "danger";
  if (status === "uploading" || status === "processing") return "warning";
  return "default";
}

export function RecordingDetailClient({
  detail,
  streamUrl,
  canReview,
  clientOrgs = [],
}: {
  detail: RecordingDetail;
  streamUrl: string;
  canReview: boolean;
  clientOrgs?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = useState<string>("");

  // comment composer
  const [commentText, setCommentText] = useState("");
  const [atTime, setAtTime] = useState(false);

  // review
  const [reviewNotes, setReviewNotes] = useState(detail.reviewNotes ?? "");

  // manage / edit
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? "");
  const [visibility, setVisibility] = useState(detail.visibility);
  const [clientOrgId, setClientOrgId] = useState(detail.clientOrganizationId ?? "");

  const ready = detail.status === "ready";

  function seekTo(sec: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = sec;
    void v.play();
  }

  // Honor the saved trim in/out points (metadata trim — the raw file is intact).
  const trimStartSec = detail.trimStartSec;
  const trimEndSec = detail.trimEndSec;
  const hasTrim = trimStartSec != null && trimEndSec != null && trimEndSec > trimStartSec;
  function clampToTrimStart() {
    const v = videoRef.current;
    if (v && hasTrim && (v.currentTime < trimStartSec! || v.currentTime >= trimEndSec!)) {
      v.currentTime = trimStartSec!;
    }
  }
  function clampToTrimEnd() {
    const v = videoRef.current;
    if (v && hasTrim && v.currentTime >= trimEndSec!) {
      v.pause();
      v.currentTime = trimStartSec!;
    }
  }
  const shownDuration = hasTrim ? trimEndSec! - trimStartSec! : detail.durationSec;

  async function run(key: string, path: string, body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    const res = await postAction(path, body);
    setBusy("");
    if (!res.ok) {
      window.alert(res.error || "Something went wrong.");
      return false;
    }
    return true;
  }

  async function postComment(body?: string, reaction?: string) {
    const timestampSec = atTime && videoRef.current ? videoRef.current.currentTime : undefined;
    const ok = await run("comment", "/api/recordings/comment", {
      recordingId: detail.id,
      body,
      reaction,
      timestampSec,
    });
    if (ok) {
      setCommentText("");
      setAtTime(false);
      router.refresh();
    }
  }

  async function setReview(reviewStatus: string) {
    const ok = await run("review", "/api/recordings/review", {
      recordingId: detail.id,
      reviewStatus,
      reviewNotes: reviewNotes.trim() || undefined,
    });
    if (ok) router.refresh();
  }

  async function saveEdits() {
    if (visibility === "client" && !clientOrgId) {
      window.alert("Pick a client to share this recording with.");
      return;
    }
    const ok = await run("edit", "/api/recordings/update", {
      recordingId: detail.id,
      title: title.trim() || undefined,
      description,
      visibility,
      clientOrganizationId: visibility === "client" ? clientOrgId : undefined,
    });
    if (ok) {
      setEditing(false);
      router.refresh();
    }
  }

  async function remove() {
    const ok = await run(
      "delete",
      "/api/recordings/delete",
      { recordingId: detail.id },
      "Delete this recording permanently? This can't be undone.",
    );
    if (ok) router.push("/recordings");
  }

  async function enhance() {
    const ok = await run("enhance", "/api/recordings/enhance", { recordingId: detail.id });
    if (ok) router.refresh();
  }

  // While an enhance is processing in the background, poll the server component
  // for completion (the detail is server-rendered, so a refresh re-fetches it).
  useEffect(() => {
    if (detail.enhanceStatus !== "processing") return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [detail.enhanceStatus, router]);

  const eStats = detail.enhanceStats as { cutMs?: number; sourceMs?: number } | null;
  const enhanceSavings =
    eStats && eStats.cutMs && eStats.sourceMs
      ? `cut ${fmt(eStats.cutMs / 1000)} (${Math.round((eStats.cutMs / eStats.sourceMs) * 100)}%)`
      : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/recordings" style={{ color: "inherit" }}>
              Recordings
            </Link>
          </div>
          <h1 style={{ marginBottom: 6 }}>{detail.title}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Badge variant={statusVariant(detail.status)} dot>
              {detail.status}
            </Badge>
            <Badge variant="default">{detail.visibility}</Badge>
            {shownDuration != null && <Badge variant="info">{fmt(shownDuration)}</Badge>}
            {detail.project && <Badge variant="primary">{detail.project}</Badge>}
            {detail.task && <Badge variant="sky">{detail.task}</Badge>}
            {detail.reviewStatus && (
              <Badge variant={detail.reviewStatus === "flagged" ? "danger" : "success"}>
                {detail.reviewStatus.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </div>
        {detail.canManage && (
          <div style={{ display: "flex", gap: 8 }}>
            {detail.downloadUrl && (
              <Button href={detail.downloadUrl} variant="ghost" size="sm">
                Download
              </Button>
            )}
            {ready && detail.enhanceStatus !== "processing" && (
              <Button variant="secondary" size="sm" loading={busy === "enhance"} onClick={enhance}>
                {detail.enhanceStatus === "done" ? "Re-enhance" : "Auto enhance"}
              </Button>
            )}
            {detail.enhanceStatus === "processing" && (
              <Button variant="secondary" size="sm" loading disabled>
                Enhancing…
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel" : "Edit"}
            </Button>
            <Button variant="danger" size="sm" loading={busy === "delete"} onClick={remove}>
              Delete
            </Button>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 24 }}>
        <div>
          {ready ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <RecordingVideo
              ref={videoRef}
              src={streamUrl}
              poster={detail.thumbnailUrl ?? undefined}
              controls
              playsInline
              onLoadedMetadata={hasTrim ? clampToTrimStart : undefined}
              onTimeUpdate={hasTrim ? clampToTrimEnd : undefined}
              style={{ width: "100%", borderRadius: "var(--radius-card)", background: "#000" }}
            />
          ) : (
            <Card>
              <p className="small">
                This recording isn&apos;t ready to play yet (status: {detail.status}).
              </p>
            </Card>
          )}

          {detail.enhanceStatus && (
            <Card style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>✨ Auto-enhanced (tightened)</h3>
                {detail.enhanceStatus === "done" && <Badge variant="success">done</Badge>}
                {detail.enhanceStatus === "processing" && (
                  <Badge variant="warning" dot>
                    processing
                  </Badge>
                )}
                {detail.enhanceStatus === "failed" && <Badge variant="danger">failed</Badge>}
              </div>
              {detail.enhanceStatus === "processing" && (
                <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
                  Removing filler words and dead air via Video Core — this can take a few minutes.
                  The page refreshes automatically.
                </p>
              )}
              {detail.enhanceStatus === "failed" && (
                <p className="small" style={{ color: "var(--color-red-600, #b91c1c)" }}>
                  {detail.enhanceError || "Enhancement failed."}
                </p>
              )}
              {detail.enhanceStatus === "done" && detail.enhancedUrl && (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <RecordingVideo
                    src={detail.enhancedUrl}
                    poster={detail.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    style={{ width: "100%", borderRadius: "var(--radius-card)", background: "#000" }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                    {detail.enhancedDurationSec != null && (
                      <Badge variant="info">{fmt(detail.enhancedDurationSec)} tightened</Badge>
                    )}
                    {enhanceSavings && <Badge variant="primary">{enhanceSavings}</Badge>}
                    <Button href={detail.enhancedUrl} variant="ghost" size="sm">
                      Download enhanced
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}

          {editing && detail.canManage && (
            <Card style={{ marginTop: 16 }}>
              <h3 style={{ margin: "0 0 12px" }}>Edit details</h3>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={label}>Title</div>
                  <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <div style={label}>Description</div>
                  <textarea
                    style={{ ...input, minHeight: 70 }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div>
                  <div style={label}>Visibility</div>
                  <select style={input} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    <option value="private">Private (you + admins)</option>
                    <option value="internal">Internal (team)</option>
                    <option value="client">Client (share to a client portal)</option>
                    <option value="link">Link (deferred — no public page yet)</option>
                  </select>
                </div>
                {visibility === "client" && (
                  <div>
                    <div style={label}>Share with client</div>
                    <select style={input} value={clientOrgId} onChange={(e) => setClientOrgId(e.target.value)}>
                      <option value="">Select a client…</option>
                      {clientOrgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <div className="small" style={{ color: "var(--color-text-tertiary)", marginTop: 6 }}>
                      Only this client&apos;s portal users will see it, under Video updates.
                    </div>
                  </div>
                )}
                <div>
                  <Button loading={busy === "edit"} onClick={saveEdits}>
                    Save
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {(detail.aiSummary || detail.aiStatus) && (
            <Card style={{ marginTop: 16 }}>
              <h3 style={{ margin: "0 0 8px" }}>Summary</h3>
              {detail.aiSummary ? (
                <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{detail.aiSummary}</p>
              ) : (
                <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
                  {detail.aiStatus === "pending" || detail.aiStatus === "running"
                    ? "Transcript & summary are being generated…"
                    : detail.aiStatus === "skipped"
                      ? "AI summary skipped (no AI key configured)."
                      : "No summary available."}
                </p>
              )}
            </Card>
          )}

          {detail.transcript && (
            <Card style={{ marginTop: 16 }}>
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Transcript</summary>
                <div style={{ marginTop: 12 }}>
                  {detail.transcriptJson && detail.transcriptJson.length > 0 ? (
                    detail.transcriptJson.map((seg, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                        <button
                          onClick={() => seekTo(seg.start)}
                          style={{
                            border: "none",
                            background: "none",
                            color: "var(--color-sky-600)",
                            cursor: "pointer",
                            fontSize: "var(--text-xs)",
                            fontVariantNumeric: "tabular-nums",
                            padding: 0,
                            flexShrink: 0,
                          }}
                        >
                          {fmt(seg.start)}
                        </button>
                        <span style={{ fontSize: "var(--text-sm)" }}>{seg.text}</span>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                      {detail.transcript}
                    </p>
                  )}
                </div>
              </details>
            </Card>
          )}
        </div>

        <div>
          {canReview && (
            <Card style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px" }}>Review</h3>
              <textarea
                style={{ ...input, minHeight: 56, marginBottom: 10 }}
                placeholder="Review notes (optional)"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" variant="secondary" loading={busy === "review"} onClick={() => setReview("reviewed")}>
                  Mark reviewed
                </Button>
                <Button size="sm" variant="ghost" loading={busy === "review"} onClick={() => setReview("flagged")}>
                  Flag
                </Button>
              </div>
              {detail.reviewedBy && (
                <p className="small" style={{ marginTop: 10, color: "var(--color-text-tertiary)" }}>
                  Last reviewed by {detail.reviewedBy}
                  {detail.reviewedAt ? ` · ${new Date(detail.reviewedAt).toLocaleDateString()}` : ""}
                </p>
              )}
            </Card>
          )}

          <Card>
            <h3 style={{ margin: "0 0 12px" }}>Comments</h3>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => postComment(undefined, emoji)}
                  disabled={busy === "comment"}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-button)",
                    background: "var(--color-surface)",
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1,
                    padding: "4px 8px",
                  }}
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <textarea
              style={{ ...input, minHeight: 56 }}
              placeholder="Add a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0" }}>
              <input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} disabled={!ready} />
              Anchor to current video time
            </label>
            <Button
              size="sm"
              loading={busy === "comment"}
              disabled={!commentText.trim()}
              onClick={() => postComment(commentText.trim())}
            >
              Comment
            </Button>

            <div style={{ marginTop: 16 }}>
              {detail.comments.length === 0 ? (
                <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
                  No comments yet.
                </p>
              ) : (
                detail.comments.map((c) => (
                  <div
                    key={c.id}
                    style={{ padding: "10px 0", borderBottom: "1px dashed var(--color-border-subtle)" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: "var(--text-sm)" }}>{c.authorName || c.authorEmail || "Someone"}</strong>
                      {c.timestampSec != null && (
                        <button
                          onClick={() => seekTo(c.timestampSec!)}
                          style={{
                            border: "none",
                            background: "none",
                            color: "var(--color-sky-600)",
                            cursor: "pointer",
                            fontSize: "var(--text-xs)",
                            padding: 0,
                          }}
                        >
                          @ {fmt(c.timestampSec)}
                        </button>
                      )}
                    </div>
                    {c.body && <div style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>{c.body}</div>}
                    {c.reaction && <div style={{ fontSize: 18 }}>{c.reaction}</div>}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
