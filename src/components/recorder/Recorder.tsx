"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  useScreenRecorder,
  recorderSupported,
  SOFT_WARN_SEC,
  MAX_RECORDING_SEC,
} from "@/components/recorder/useScreenRecorder";

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
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function putToR2(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress?: (p: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(blob);
  });
}

export function Recorder() {
  const router = useRouter();
  const r = useScreenRecorder();
  const [wantCamera, setWantCamera] = useState(true);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [task, setTask] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upErr, setUpErr] = useState<string | null>(null);
  // Resolve browser support after mount to avoid an SSR/client hydration mismatch.
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(recorderSupported()), []);

  if (supported === null) return null;
  if (!supported) {
    return (
      <Card>
        <h2 style={{ fontFamily: "var(--font-display)", margin: "0 0 8px" }}>Recording needs a desktop browser</h2>
        <p className="small">
          Screen recording uses APIs available in desktop Chrome, Edge, or Firefox. You can still watch and
          comment on recordings here from any device.
        </p>
      </Card>
    );
  }

  const live = r.status === "recording" || r.status === "paused";
  const softWarn = r.elapsedSec >= SOFT_WARN_SEC;

  async function handleUpload() {
    if (!r.recorded) return;
    setUploading(true);
    setUpErr(null);
    setProgress(0);
    try {
      const created = await postAction("/api/recordings/create", {
        mimeType: r.recorded.mimeType,
        title: title.trim() || undefined,
        project: project.trim() || undefined,
        task: task.trim() || undefined,
      });
      if (!created.ok) throw new Error(created.error || "Couldn't create the recording.");
      const { recordingId, uploadUrl, thumbUploadUrl } = created.result as {
        recordingId: string;
        uploadUrl: string;
        thumbUploadUrl: string;
      };

      await putToR2(uploadUrl, r.recorded.blob, r.recorded.mimeType, (p) =>
        setProgress(Math.round(p * 100)),
      );
      if (r.recorded.thumbnailBlob) {
        await putToR2(thumbUploadUrl, r.recorded.thumbnailBlob, "image/jpeg").catch(() => undefined);
      }

      const fin = await postAction("/api/recordings/finalize", {
        recordingId,
        sizeBytes: r.recorded.blob.size,
        durationSec: r.recorded.durationSec,
      });
      if (!fin.ok) throw new Error(fin.error || "Couldn't finalize the recording.");

      router.push(`/recordings/${recordingId}`);
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : "Upload failed.");
      setUploading(false);
    }
  }

  return (
    <Card>
      {/* Live compositing canvas — hidden until a session is running or recorded. */}
      <div style={{ display: live ? "block" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Badge variant={r.status === "paused" ? "warning" : "danger"} dot>
            {r.status === "paused" ? "Paused" : "Recording"} · {fmt(r.elapsedSec)}
          </Badge>
          {softWarn && (
            <span className="small" style={{ color: "var(--color-warning-dark)" }}>
              Long recording — auto-stops at {fmt(MAX_RECORDING_SEC)}.
            </span>
          )}
        </div>
        <canvas
          ref={r.canvasRef}
          onPointerDown={r.onCanvasPointerDown}
          onPointerMove={r.onCanvasPointerMove}
          onPointerUp={r.onCanvasPointerUp}
          style={{
            width: "100%",
            borderRadius: "var(--radius-card)",
            background: "#000",
            touchAction: "none",
            cursor: r.cameraOn ? "grab" : "default",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          {r.status === "recording" ? (
            <Button variant="ghost" size="sm" onClick={r.pause}>
              Pause
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={r.resume}>
              Resume
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={r.stop}>
            Stop recording
          </Button>
          {r.cameraOn && (
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              Bubble size
              <input
                type="range"
                min={8}
                max={22}
                defaultValue={13}
                onChange={(e) => r.setBubbleScale(Number(e.target.value) / 100)}
              />
            </label>
          )}
        </div>
        {r.cameraOn && (
          <p className="small" style={{ color: "var(--color-text-tertiary)", marginTop: 8 }}>
            Drag the webcam bubble anywhere on the preview.
          </p>
        )}
      </div>

      {/* Idle — choose options + start. */}
      {r.status === "idle" && (
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 6px" }}>
            Record your screen
          </h2>
          <p className="small" style={{ marginBottom: 16 }}>
            Capture your screen with voice narration{wantCamera ? " and a webcam bubble" : ""}. You&apos;ll pick
            which window or tab to share next.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <input type="checkbox" checked={wantCamera} onChange={(e) => setWantCamera(e.target.checked)} />
            <span className="small">Include webcam bubble</span>
          </label>
          <Button onClick={() => r.start({ camera: wantCamera })}>Start recording</Button>
        </div>
      )}

      {/* Error. */}
      {r.status === "error" && (
        <div>
          <Badge variant="danger" dot>
            Couldn&apos;t start
          </Badge>
          <p className="small" style={{ margin: "10px 0 16px", color: "var(--color-error-dark)" }}>
            {r.error}
          </p>
          <Button variant="ghost" onClick={r.reset}>
            Try again
          </Button>
        </div>
      )}

      {/* Recorded — preview + metadata + upload. */}
      {r.status === "recorded" && r.recorded && (
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 12px" }}>
            Review &amp; save
          </h2>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={r.recorded.url}
            controls
            style={{ width: "100%", borderRadius: "var(--radius-card)", background: "#000", marginBottom: 16 }}
          />
          <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
            <div>
              <div style={label}>Title</div>
              <input
                style={input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's this recording about?"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={label}>Project (optional)</div>
                <input style={input} value={project} onChange={(e) => setProject(e.target.value)} />
              </div>
              <div>
                <div style={label}>Task (optional)</div>
                <input style={input} value={task} onChange={(e) => setTask(e.target.value)} />
              </div>
            </div>
          </div>

          {uploading && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "var(--color-bg-secondary)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: "var(--color-sky-500)",
                    transition: "width 120ms linear",
                  }}
                />
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                Uploading… {progress}%
              </div>
            </div>
          )}
          {upErr && (
            <p className="small" style={{ color: "var(--color-error-dark)", marginBottom: 12 }}>
              {upErr}
            </p>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <Button onClick={handleUpload} loading={uploading} disabled={uploading}>
              Save recording
            </Button>
            <Button variant="ghost" onClick={r.reset} disabled={uploading}>
              Discard &amp; re-record
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
