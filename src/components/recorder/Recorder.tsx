"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { postAction } from "@/components/ActionButton";
import {
  useScreenRecorder,
  recorderSupported,
  type CaptureSource,
} from "@/components/recorder/useScreenRecorder";

/* ── small helpers ──────────────────────────────────────────────────────── */

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function putToR2(url: string, blob: Blob, contentType: string, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(blob);
  });
}

const NAVY = "var(--color-navy-900)";
const RED = "#f04c4c";

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onChange())}
      style={{
        cursor: "pointer",
        flex: "none",
        width: 44,
        height: 26,
        borderRadius: 999,
        padding: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: on ? "flex-end" : "flex-start",
        backgroundColor: on ? "#4dc4e8" : "#d2d2d7",
        transition: "background-color .18s, justify-content .18s",
      }}
    >
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "var(--shadow-sm)" }} />
    </div>
  );
}

const optLabel: CSSProperties = { fontSize: "var(--text-sm)", fontWeight: 600 };
const optSub: CSSProperties = { fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" };
const optIcon: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 9,
  background: "var(--color-sky-50)",
  color: "var(--color-sky-600)",
  flex: "none",
};
const eyebrow: CSSProperties = {
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--color-text-tertiary)",
};
const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--color-text-tertiary)",
  marginBottom: 6,
};
const fieldInput: CSSProperties = {
  width: "100%",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "10px 12px",
  font: "inherit",
  fontSize: "var(--text-sm)",
  background: "#fff",
  color: "var(--color-text-primary)",
  outline: "none",
};
const navyPill: CSSProperties = {
  appearance: "none",
  border: "none",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  color: "#fff",
  background: NAVY,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  boxShadow: "var(--shadow-navy-md)",
};

/** Mic-level meter — `levels` are 0..1 bars. `compact` renders the small pill wave. */
function Meter({ levels, compact = false }: { levels: number[]; compact?: boolean }) {
  const bars = compact ? levels.slice(0, 7) : levels;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: compact ? 2 : 3,
        height: compact ? 22 : 26,
        width: compact ? 50 : "100%",
      }}
    >
      {bars.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(compact ? 10 : 8, Math.min(100, v * 100))}%`,
            minHeight: 2,
            borderRadius: 2,
            background: compact
              ? "rgba(255,255,255,.85)"
              : "linear-gradient(180deg, var(--color-sky-400), var(--color-sky-600))",
            transition: "height .08s linear",
          }}
        />
      ))}
    </div>
  );
}

/* ── icons (inline, matching the design) ────────────────────────────────── */
const I = {
  cam: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
  ),
  mic: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></svg>
  ),
  clock: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
  ),
};

/* ── main component ─────────────────────────────────────────────────────── */

export function Recorder() {
  const r = useScreenRecorder();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [source, setSource] = useState<CaptureSource>("screen");
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [count, setCount] = useState<number | null>(null);
  const cdRef = useRef<number | null>(null);

  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [task, setTask] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // review trim (percent of full duration) + playback
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // draggable control pill
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const [pillPos, setPillPos] = useState<{ x: number; y: number } | null>(null);
  const pillDrag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const ok = recorderSupported();
    setSupported(ok);
    if (ok) void r.startPreview({ camera: true, mic: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop the countdown interval if the component unmounts mid-3-2-1, so a queued
  // beginRecording() can't fire against a torn-down hook.
  useEffect(
    () => () => {
      if (cdRef.current != null) window.clearInterval(cdRef.current);
    },
    [],
  );

  const clearCountdown = useCallback(() => {
    if (cdRef.current != null) window.clearInterval(cdRef.current);
    cdRef.current = null;
    setCount(null);
  }, []);

  const backToSetup = useCallback(() => {
    clearCountdown();
    setUploading(false);
    setProgress(0);
    setUpErr(null);
    setSavedId(null);
    setTitle("");
    setProject("");
    setTask("");
    setTrimStart(0);
    setTrimEnd(100);
    setPlaying(false);
    setPillPos(null);
    r.reset();
    void r.startPreview({ camera: true, mic: true }); // fresh defaults for the next take
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearCountdown]);

  const begin = useCallback(async () => {
    const ok = await r.prepare({ source });
    if (!ok) return; // hook moved to "error"
    if (countdownEnabled) {
      let c = 3;
      setCount(c);
      cdRef.current = window.setInterval(() => {
        c -= 1;
        if (c <= 0) {
          clearCountdown();
          r.beginRecording();
        } else {
          setCount(c);
        }
      }, 850);
    } else {
      r.beginRecording();
    }
  }, [r, source, countdownEnabled, clearCountdown]);

  // ── review video ↔ trim wiring ──────────────────────────────────────────
  const dur = r.recorded?.durationSec || 0;
  const onLoadedMeta = useCallback(() => {
    const v = videoRef.current;
    if (v) v.currentTime = (trimStart / 100) * (v.duration || dur);
  }, [trimStart, dur]);
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const endSec = (trimEnd / 100) * v.duration;
    if (v.currentTime >= endSec) {
      v.pause();
      v.currentTime = (trimStart / 100) * v.duration;
      setPlaying(false);
    }
  }, [trimStart, trimEnd]);
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      const startSec = (trimStart / 100) * v.duration;
      const endSec = (trimEnd / 100) * v.duration;
      if (v.currentTime < startSec || v.currentTime >= endSec - 0.05) v.currentTime = startSec;
      void v.play();
      setPlaying(true);
    }
  }, [playing, trimStart, trimEnd]);

  const dragHandle = useCallback(
    (which: "start" | "end") => (e: React.PointerEvent) => {
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const move = (clientX: number) => {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        if (which === "start") setTrimStart(Math.min(pct, trimEnd - 2));
        else setTrimEnd(Math.max(pct, trimStart + 2));
      };
      move(e.clientX);
      const onMove = (ev: PointerEvent) => move(ev.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [trimStart, trimEnd],
  );

  // ── pill drag ───────────────────────────────────────────────────────────
  const onPillDown = useCallback((e: React.PointerEvent) => {
    const stage = stageRef.current;
    const pill = pillRef.current;
    if (!stage || !pill) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const sr = stage.getBoundingClientRect();
    const pr = pill.getBoundingClientRect();
    pillDrag.current = { dx: e.clientX - pr.left, dy: e.clientY - pr.top };
    const onMove = (ev: PointerEvent) => {
      if (!pillDrag.current) return;
      const x = Math.max(8, Math.min(sr.width - pr.width - 8, ev.clientX - sr.left - pillDrag.current.dx));
      const y = Math.max(8, Math.min(sr.height - pr.height - 8, ev.clientY - sr.top - pillDrag.current.dy));
      setPillPos({ x, y });
    };
    const onUp = () => {
      pillDrag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  async function handleSave() {
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
      await putToR2(uploadUrl, r.recorded.blob, r.recorded.mimeType, (p) => setProgress(Math.round(p * 100)));
      if (r.recorded.thumbnailBlob) {
        await putToR2(thumbUploadUrl, r.recorded.thumbnailBlob, "image/jpeg").catch(() => undefined);
      }
      const trimmed = trimStart > 0.5 || trimEnd < 99.5;
      const fin = await postAction("/api/recordings/finalize", {
        recordingId,
        sizeBytes: r.recorded.blob.size,
        durationSec: r.recorded.durationSec,
        trimStartSec: trimmed ? (trimStart / 100) * dur : undefined,
        trimEndSec: trimmed ? (trimEnd / 100) * dur : undefined,
      });
      if (!fin.ok) throw new Error(fin.error || "Couldn't finalize the recording.");
      setUploading(false);
      setSavedId(recordingId);
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : "Upload failed.");
      setUploading(false);
    }
  }

  /* ── render ───────────────────────────────────────────────────────────── */
  if (supported === null) return null;

  const card: CSSProperties = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--shadow-lg)",
    overflow: "hidden",
  };

  if (!supported) {
    return (
      <div style={{ ...card, padding: "48px 40px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", margin: "0 0 8px", color: NAVY }}>
          Recording needs a desktop browser
        </h2>
        <p className="small" style={{ maxWidth: 440, margin: "0 auto" }}>
          Screen recording uses APIs available in desktop Chrome, Edge, or Firefox. You can still watch and comment on
          recordings here from any device.
        </p>
      </div>
    );
  }

  const isSetup = (r.status === "idle" || r.status === "ready") && count === null;
  const isCountdown = count !== null;
  const isLive = r.status === "recording" || r.status === "paused";
  const isReview = r.status === "recorded";
  const isError = r.status === "error";

  const micPeak = Math.max(...r.levels, 0);
  const micStatus = !r.micOn
    ? { label: "Muted", color: "var(--color-text-tertiary)" }
    : micPeak > 0.45
      ? { label: "Good", color: "var(--color-success)" }
      : micPeak > 0.12
        ? { label: "Listening", color: "var(--color-sky-600)" }
        : { label: "Quiet", color: "var(--color-warning-dark, #b8860b)" };

  const trimmedDur = (Math.max(0, trimEnd - trimStart) / 100) * dur;

  return (
    <div style={card}>
      {/* ── SETUP ─────────────────────────────────────────────────────────── */}
      {isSetup && (
        <div style={{ padding: "30px 32px 32px" }} className="pwa-enter">
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-.025em", fontSize: "var(--text-2xl)", margin: "0 0 6px", color: NAVY }}>
              Set up your recording
            </h2>
            <p style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>
              Choose what to capture, then start. You can move your camera and stop anytime.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 24, alignItems: "start" }}>
            {/* left: source + options */}
            <div>
              <div style={{ ...eyebrow, marginBottom: 11 }}>What to capture</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 26 }}>
                {(
                  [
                    { key: "screen", title: "Full screen", desc: "Everything you see" },
                    { key: "window", title: "Window", desc: "One app only" },
                    { key: "tab", title: "Browser tab", desc: "A single tab" },
                  ] as { key: CaptureSource; title: string; desc: string }[]
                ).map((s) => {
                  const sel = source === s.key;
                  return (
                    <div
                      key={s.key}
                      onClick={() => setSource(s.key)}
                      style={{
                        position: "relative",
                        cursor: "pointer",
                        borderRadius: "var(--radius-lg)",
                        border: sel ? "2px solid var(--color-sky-400)" : "1.5px solid var(--color-border)",
                        background: sel ? "var(--color-sky-50)" : "var(--color-bg-secondary)",
                        padding: "14px 12px 13px",
                        boxShadow: sel ? "var(--shadow-sky-sm)" : undefined,
                        transition: "all .2s cubic-bezier(.25,.46,.45,.94)",
                      }}
                    >
                      {sel && (
                        <div style={{ position: "absolute", top: 9, right: 9, width: 18, height: 18, borderRadius: "50%", background: "var(--color-sky-400)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                      )}
                      <div style={{ width: 34, height: 26, borderRadius: 5, border: `2px solid ${NAVY}`, position: "relative", marginBottom: 12 }}>
                        {s.key === "screen" && <span style={{ position: "absolute", left: "50%", bottom: -7, transform: "translateX(-50%)", width: 14, height: 3, borderRadius: 2, background: NAVY }} />}
                        {s.key === "window" && <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 7, background: NAVY }} />}
                        {s.key === "tab" && <span style={{ position: "absolute", top: 0, left: 0, width: 17, height: 7, borderRadius: "0 0 5px 0", background: NAVY }} />}
                      </div>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>{s.title}</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>{s.desc}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ ...eyebrow, marginBottom: 11 }}>Options</div>
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                {[
                  { icon: I.cam, label: "Camera bubble", sub: "Show your webcam in a corner", on: r.cameraOn, toggle: () => r.setPreviewCamera(!r.cameraOn) },
                  { icon: I.mic, label: "Microphone", sub: "Narrate as you record", on: r.micOn, toggle: () => r.setPreviewMic(!r.micOn) },
                  { icon: I.clock, label: "3-2-1 countdown", sub: "A moment to get ready", on: countdownEnabled, toggle: () => setCountdownEnabled((v) => !v) },
                ].map((opt, i) => (
                  <div key={opt.label}>
                    {i > 0 && <div style={{ height: 1, background: "var(--color-border-subtle)" }} />}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 14px", background: "var(--color-surface)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <span style={optIcon}>{opt.icon}</span>
                        <div><div style={optLabel}>{opt.label}</div><div style={optSub}>{opt.sub}</div></div>
                      </div>
                      <Toggle on={opt.on} onChange={opt.toggle} label={opt.label} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* right: preview + meter */}
            <div>
              <div style={{ ...eyebrow, marginBottom: 11 }}>Preview</div>
              <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", background: "#0b1220", boxShadow: "var(--shadow-md)", position: "relative", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(90% 90% at 50% 30%, rgba(77,196,232,.16), transparent 70%)" }} />
                {/* live camera preview (hidden until a stream attaches) */}
                <video
                  ref={r.camPreviewRef}
                  muted
                  playsInline
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: r.cameraOn ? "block" : "none", transform: "scaleX(-1)" }}
                />
                {!r.cameraOn && (
                  <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "rgba(255,255,255,.5)" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" /><path d="M10 6h4a2 2 0 0 1 2 2v2" /><path d="M22 8l-6 4 6 4V8z" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                    <div style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>Camera off</div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 14, padding: "12px 13px", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-secondary)" }}>Mic level</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: micStatus.color }}>{micStatus.label}</span>
                </div>
                <Meter levels={r.levels} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--color-border-subtle)" }}>
            <button onClick={begin} style={{ ...navyPill, fontSize: "var(--text-base)", padding: "0 26px", height: 52 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: RED, boxShadow: "0 0 0 4px rgba(240,76,76,.35)" }} />
              Start recording
            </button>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
              You&apos;ll pick the exact {source === "tab" ? "tab" : source === "window" ? "window" : "screen"} to share next.
            </span>
          </div>
        </div>
      )}

      {/* ── COUNTDOWN ─────────────────────────────────────────────────────── */}
      {isCountdown && (
        <div style={{ padding: 18 }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "linear-gradient(160deg, #0e1730, #0b1220 60%, #0a1a28)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 60% at 50% 45%, rgba(77,196,232,.16), transparent 70%)" }} />
            <div key={count} style={{ position: "relative", width: 132, height: 132, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.06)", border: "1.5px solid rgba(255,255,255,.16)", animation: "pwaPop .8s cubic-bezier(.34,1.56,.64,1)" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(77,196,232,.6)", animation: "pwaRing 1.4s ease-out infinite" }} />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 64, color: "#fff", letterSpacing: "-.03em" }}>{count}</span>
            </div>
            <div style={{ position: "relative", color: "rgba(255,255,255,.78)", fontSize: "var(--text-base)", fontWeight: 600 }}>Get ready — recording starts in…</div>
          </div>
        </div>
      )}

      {/* ── LIVE (recording / paused) ─────────────────────────────────────── */}
      <div style={{ display: isLive ? "block" : "none", padding: 18 }}>
        <div ref={stageRef} style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "#0b1220", boxShadow: "var(--shadow-lg)", touchAction: "none", userSelect: "none" }}>
          <canvas
            ref={r.canvasRef}
            onPointerDown={r.onCanvasPointerDown}
            onPointerMove={r.onCanvasPointerMove}
            onPointerUp={r.onCanvasPointerUp}
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000", cursor: r.cameraOn ? "grab" : "default" }}
          />
          {r.status === "recording" && (
            <div style={{ position: "absolute", inset: 0, border: "3px solid rgba(240,76,76,.85)", borderRadius: "var(--radius-lg)", pointerEvents: "none", boxShadow: "inset 0 0 28px rgba(240,76,76,.28)", animation: "pwaPulse 1.8s ease-in-out infinite" }} />
          )}
          {r.status === "paused" && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(8,12,24,.5)", borderRadius: "var(--radius-lg)", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", opacity: .9 }}>Paused</span>
            </div>
          )}
          {/* source chip */}
          <div style={{ position: "absolute", top: 14, left: 14, zIndex: 3, display: "flex", alignItems: "center", gap: 7, background: "rgba(13,18,32,.72)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.12)", padding: "6px 11px", borderRadius: 999, color: "rgba(255,255,255,.85)", fontSize: "var(--text-xs)", fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /></svg>
            {source === "tab" ? "Browser tab" : source === "window" ? "Window" : "Full screen"}
          </div>

          {/* floating control pill */}
          <div
            ref={pillRef}
            style={{
              position: "absolute",
              ...(pillPos ? { left: pillPos.x, top: pillPos.y } : { left: 18, bottom: 18 }),
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(13,18,32,.86)",
              backdropFilter: "blur(16px) saturate(160%)",
              border: "1px solid rgba(255,255,255,.13)",
              borderRadius: 999,
              padding: "6px 8px",
              boxShadow: "0 14px 36px rgba(0,0,0,.45)",
            }}
          >
            <div onPointerDown={onPillDown} title="Drag to move" style={{ cursor: "grab", padding: "0 5px", display: "flex", alignItems: "center", color: "rgba(255,255,255,.4)", alignSelf: "stretch", touchAction: "none" }}>
              <svg width="11" height="20" viewBox="0 0 11 20" fill="currentColor"><circle cx="2.5" cy="4" r="1.5" /><circle cx="8.5" cy="4" r="1.5" /><circle cx="2.5" cy="10" r="1.5" /><circle cx="8.5" cy="10" r="1.5" /><circle cx="2.5" cy="16" r="1.5" /><circle cx="8.5" cy="16" r="1.5" /></svg>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 4px" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.status === "paused" ? "#ffb340" : RED, animation: r.status === "recording" ? "pwaPulse 1.4s ease-in-out infinite" : undefined }} />
              <span style={{ color: "#fff", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "var(--text-base)", minWidth: 40 }}>{fmt(r.elapsedSec)}</span>
            </div>
            <div style={{ opacity: .9 }}><Meter levels={r.levels} compact /></div>
            <div style={{ width: 1, height: 26, background: "rgba(255,255,255,.14)", margin: "0 2px" }} />

            {r.status === "recording" ? (
              <PillBtn title="Pause" onClick={r.pause}><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg></PillBtn>
            ) : (
              <PillBtn title="Resume" accent onClick={r.resume}><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg></PillBtn>
            )}
            <PillBtn title={r.micOn ? "Mute mic" : "Unmute mic"} danger={!r.micOn} onClick={r.toggleMic}>
              {r.micOn ? I.mic : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /></svg>
              )}
            </PillBtn>
            <PillBtn title={r.cameraOn ? "Turn camera off" : "Turn camera on"} dim={!r.cameraOn} onClick={r.toggleCamera}>
              {r.cameraOn ? I.cam : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" /><path d="M10 6h4a2 2 0 0 1 2 2v2" /><path d="M22 8l-6 4 6 4V8z" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
              )}
            </PillBtn>
            <div style={{ width: 1, height: 26, background: "rgba(255,255,255,.14)", margin: "0 2px" }} />
            <button onClick={r.stop} style={{ appearance: "none", border: "none", cursor: "pointer", font: "inherit", fontWeight: 600, fontSize: "var(--text-sm)", color: "#fff", background: RED, padding: "0 16px 0 13px", height: 36, borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: "#fff" }} />Stop
            </button>
          </div>
        </div>
        <p style={{ textAlign: "center", margin: "14px 0 2px", fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
          Drag the control bar, or drag your camera bubble on the preview.
        </p>
      </div>

      {/* ── REVIEW / SAVED ────────────────────────────────────────────────── */}
      {isReview && r.recorded && (
        <div style={{ padding: "28px 32px 32px" }} className="pwa-enter">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-.025em", fontSize: "var(--text-2xl)", margin: "0 0 4px", color: NAVY }}>Review &amp; save</h2>
              <p style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>Trim the ends, add a few details, then save to your library.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border-subtle)", padding: "6px 12px", borderRadius: 999, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
              {I.clock} {fmt(trimmedDur)}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 26, alignItems: "start" }}>
            {/* player + trim */}
            <div>
              <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "#000", boxShadow: "var(--shadow-md)" }}>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video ref={videoRef} src={r.recorded.url} onLoadedMetadata={onLoadedMeta} onTimeUpdate={onTimeUpdate} onEnded={() => setPlaying(false)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <button onClick={togglePlay} title={playing ? "Pause" : "Play"} style={{ pointerEvents: "auto", appearance: "none", border: "none", cursor: "pointer", width: playing ? 56 : 64, height: playing ? 56 : 64, borderRadius: "50%", background: playing ? "rgba(13,18,32,.55)" : "rgba(255,255,255,.92)", backdropFilter: playing ? "blur(8px)" : undefined, color: playing ? "#fff" : NAVY, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: playing ? undefined : "var(--shadow-lg)" }}>
                    {playing ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z" /></svg>}
                  </button>
                </div>
              </div>

              {/* trim bar */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...eyebrow }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg>Trim
                  </span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Drag the handles to set start and end</span>
                </div>
                <div ref={trackRef} style={{ position: "relative", height: 44, borderRadius: "var(--radius-md)", background: "var(--color-bg-secondary)", border: "1px solid var(--color-border-subtle)", overflow: "hidden", touchAction: "none" }}>
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${trimStart}%`, background: "rgba(13,18,32,.06)" }} />
                  <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${100 - trimEnd}%`, background: "rgba(13,18,32,.06)" }} />
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: `${trimStart}%`, width: `${Math.max(0, trimEnd - trimStart)}%`, background: "rgba(77,196,232,.16)", borderTop: "2px solid var(--color-sky-400)", borderBottom: "2px solid var(--color-sky-400)" }} />
                  {(["start", "end"] as const).map((h) => (
                    <div key={h} onPointerDown={dragHandle(h)} style={{ position: "absolute", top: 0, bottom: 0, left: `${h === "start" ? trimStart : trimEnd}%`, width: 14, transform: "translateX(-50%)", cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
                      <div style={{ width: 6, height: "70%", borderRadius: 3, background: "var(--color-sky-500)", boxShadow: "var(--shadow-sm)" }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* metadata + save */}
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div><label style={fieldLabel}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's this recording about?" style={fieldInput} /></div>
                <div><label style={fieldLabel}>Project</label><input value={project} onChange={(e) => setProject(e.target.value)} placeholder="Optional" style={fieldInput} /></div>
                <div><label style={fieldLabel}>Task</label><input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Optional" style={fieldInput} /></div>
              </div>

              {uploading && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--color-bg-secondary)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "var(--color-sky-500)", transition: "width 120ms linear" }} />
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>Uploading… {progress}%</div>
                </div>
              )}
              {upErr && <p className="small" style={{ color: "var(--color-error-dark)", marginTop: 12 }}>{upErr}</p>}

              {!savedId ? (
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={handleSave} disabled={uploading} style={{ ...navyPill, fontSize: "var(--text-sm)", padding: "0 22px", height: 46, opacity: uploading ? 0.6 : 1, cursor: uploading ? "not-allowed" : "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                    {uploading ? "Saving…" : "Save recording"}
                  </button>
                  <button onClick={backToSetup} disabled={uploading} style={{ appearance: "none", cursor: uploading ? "not-allowed" : "pointer", font: "inherit", fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", background: "transparent", border: "1px solid var(--color-border)", padding: "0 18px", height: 46, borderRadius: 999 }}>Discard</button>
                </div>
              ) : (
                <div>
                  <div style={{ marginTop: 20, padding: 16, borderRadius: "var(--radius-md)", background: "var(--color-success-light)", border: "1px solid #b6ead0", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ flex: "none", width: 36, height: 36, borderRadius: "50%", background: "var(--color-success)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                    <div><div style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--color-success-dark)" }}>Saved to your library</div><div style={{ fontSize: "var(--text-xs)", color: "#1a7a4a" }}>Processing &amp; transcription will finish shortly.</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", paddingTop: 14 }}>
                    <button onClick={backToSetup} style={{ appearance: "none", cursor: "pointer", font: "inherit", fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--color-text-accent)", background: "transparent", border: "none", padding: 0 }}>Record another →</button>
                    <a href={`/recordings/${savedId}`} className="small" style={{ color: "var(--color-sky-600)", textDecoration: "none" }}>View recording</a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR ─────────────────────────────────────────────────────────── */}
      {isError && (
        <div style={{ padding: "56px 40px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--color-error-light)", color: "var(--color-error-dark)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </span>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-.025em", fontSize: "var(--text-2xl)", margin: "0 0 8px", color: NAVY }}>We couldn&apos;t start recording</h2>
          <p style={{ margin: "0 0 22px", maxWidth: 420, fontSize: "var(--text-base)", color: "var(--color-text-secondary)", lineHeight: 1.55 }}>
            {r.error || "Screen recording needs permission and a desktop browser."} Allow screen sharing when prompted, then try again — you can still watch and comment on recordings from any device.
          </p>
          <button onClick={backToSetup} style={{ ...navyPill, fontSize: "var(--text-sm)", padding: "0 22px", height: 46 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6" /><path d="M3.5 8a9 9 0 1 0 2.3-3.3L3 8" /></svg>Try again
          </button>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 22, padding: "8px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-secondary)", fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            Works in desktop Chrome, Edge, or Firefox
          </div>
        </div>
      )}
    </div>
  );
}

/** Round control button used inside the floating recording pill. */
function PillBtn({
  children,
  onClick,
  title,
  accent,
  danger,
  dim,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  accent?: boolean;
  danger?: boolean;
  dim?: boolean;
}) {
  const bg = accent ? "rgba(77,196,232,.9)" : danger ? "rgba(240,76,76,.22)" : dim ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.1)";
  const color = accent ? "#06243a" : danger ? "#ff9a9a" : dim ? "rgba(255,255,255,.55)" : "#fff";
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{ appearance: "none", border: "none", cursor: "pointer", width: 36, height: 36, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}
