"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORDING_SEC = 30 * 60; // hard stop
export const SOFT_WARN_SEC = 15 * 60; // soft warning
export const METER_BARS = 26; // mic-level meter resolution (matches the design)
export const CAPTURE_FPS = 30; // canvas capture + compositor draw rate
// Throttle the compositor to the capture rate. Drawing at the display refresh
// (often 60–120 Hz) when we only capture 30 fps just burns CPU; a small slack
// keeps us from dropping below 30 due to rAF jitter.
const DRAW_INTERVAL_MS = 1000 / CAPTURE_FPS - 5;

export type RecorderStatus = "idle" | "ready" | "recording" | "paused" | "recorded" | "error";
export type CaptureSource = "screen" | "window" | "tab";

export type RecordedClip = {
  blob: Blob;
  url: string;
  mimeType: string;
  durationSec: number;
  thumbnailBlob: Blob | null;
};

type Bubble = { x: number; y: number; r: number };

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

const SURFACE: Record<CaptureSource, "monitor" | "window" | "browser"> = {
  screen: "monitor",
  window: "window",
  tab: "browser",
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

export function recorderSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

function humanError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError") return "Permission denied — allow screen sharing (and mic) to record.";
  if (name === "NotFoundError") return "No microphone or camera found.";
  if (name === "NotReadableError") return "Your camera or mic is in use by another app.";
  return err instanceof Error ? err.message : "Couldn't start recording.";
}

const ZERO_LEVELS = Array.from({ length: METER_BARS }, () => 0);

/**
 * Screen + mic (+ optional webcam bubble) capture for the Loom-style recorder.
 *
 * Flow: startPreview (acquire mic + optional camera so the setup screen can show a
 * live camera preview and a real mic-level meter) → prepare (acquire the screen via
 * getDisplayMedia, build the compositing canvas) → beginRecording (start
 * MediaRecorder; the canvas IS the recorded video, so the draggable bubble is
 * exactly what's captured). Mic level comes from a Web Audio analyser on the mic
 * track; muting toggles the track's `enabled` (kept in the mix, silenced).
 */
export function useScreenRecorder() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null); // live composite = recorded source
  const camPreviewRef = useRef<HTMLVideoElement | null>(null); // setup-screen camera preview

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<RecordedClip | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [levels, setLevels] = useState<number[]>(ZERO_LEVELS);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const camEnabledRef = useRef(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("video/webm");
  const rafRef = useRef<number>(0);
  const lastDrawRef = useRef(0);
  const bubbleRef = useRef<Bubble>({ x: 0, y: 0, r: 0 });
  const draggingRef = useRef(false);

  // Web Audio mic-level meter
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number>(0);
  const micOnRef = useRef(true);
  // False once unmounted — guards async stream acquisitions so a stream that
  // resolves AFTER teardown is stopped immediately (no lingering camera/screen light).
  const mountedRef = useRef(true);

  // timer
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const elapsedMsRef = useRef(0);
  const pausedRef = useRef(false);

  // ── Mic level meter ──────────────────────────────────────────────────────
  const runMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const smooth = new Array(METER_BARS).fill(0);
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      const per = Math.floor(bins.length / METER_BARS) || 1;
      const next = new Array(METER_BARS);
      for (let b = 0; b < METER_BARS; b++) {
        let sum = 0;
        for (let i = 0; i < per; i++) sum += bins[b * per + i] ?? 0;
        const raw = micOnRef.current ? Math.min(1, sum / per / 200) : 0;
        // ease toward the target so bars don't jitter harshly
        smooth[b] = smooth[b] * 0.6 + raw * 0.4;
        next[b] = Math.max(micOnRef.current ? 0.04 : 0, smooth[b]);
      }
      setLevels(next);
      meterRafRef.current = requestAnimationFrame(tick);
    };
    meterRafRef.current = requestAnimationFrame(tick);
  }, []);

  const attachMeter = useCallback(
    (mic: MediaStream) => {
      try {
        const Ctx =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        const src = ctx.createMediaStreamSource(mic);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        src.connect(analyser);
        analyserRef.current = analyser;
        cancelAnimationFrame(meterRafRef.current);
        runMeter();
      } catch {
        /* meter is best-effort */
      }
    },
    [runMeter],
  );

  // ── Camera preview stream (setup screen) ─────────────────────────────────
  const acquireCamera = useCallback(async () => {
    if (camStreamRef.current) return;
    const cam = await navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .catch(() => null);
    if (cam && !mountedRef.current) {
      cam.getTracks().forEach((t) => t.stop()); // unmounted mid-prompt — don't leave the camera on
      return;
    }
    if (cam) {
      camStreamRef.current = cam;
      const v = camPreviewRef.current;
      if (v) {
        v.srcObject = cam;
        v.muted = true;
        v.playsInline = true;
        await v.play().catch(() => undefined);
      }
    }
  }, []);

  const releaseCamera = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    if (camPreviewRef.current) camPreviewRef.current.srcObject = null;
  }, []);

  /** Acquire mic (for the meter) + optional camera so setup can preview them. */
  const startPreview = useCallback(
    async (opts: { camera: boolean; mic: boolean }) => {
      setCameraOn(opts.camera);
      setMicOn(opts.mic);
      micOnRef.current = opts.mic;
      if (!recorderSupported()) return;
      try {
        if (!micStreamRef.current) {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!mountedRef.current) {
            mic.getTracks().forEach((t) => t.stop());
            return;
          }
          micStreamRef.current = mic;
          attachMeter(mic);
        }
        micStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = opts.mic));
        if (opts.camera) await acquireCamera();
        else releaseCamera();
      } catch {
        // Preview is best-effort; the real permission gate is at prepare().
      }
    },
    [attachMeter, acquireCamera, releaseCamera],
  );

  const setPreviewCamera = useCallback(
    (on: boolean) => {
      setCameraOn(on);
      if (on) void acquireCamera();
      else releaseCamera();
    },
    [acquireCamera, releaseCamera],
  );

  const setPreviewMic = useCallback((on: boolean) => {
    setMicOn(on);
    micOnRef.current = on;
    micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = on));
  }, []);

  // ── Compositing draw loop ────────────────────────────────────────────────
  const draw = useCallback(() => {
    rafRef.current = requestAnimationFrame(draw);
    const now = performance.now();
    if (now - lastDrawRef.current < DRAW_INTERVAL_MS) return; // throttle to CAPTURE_FPS
    lastDrawRef.current = now;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const sv = screenVideoRef.current;
      if (sv && sv.readyState >= 2) ctx.drawImage(sv, 0, 0, canvas.width, canvas.height);

      const cv = camVideoRef.current;
      if (camEnabledRef.current && cv && cv.readyState >= 2 && cv.videoWidth > 0) {
        const { x, y, r } = bubbleRef.current;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const d = r * 2;
        const scale = Math.max(d / cv.videoWidth, d / cv.videoHeight);
        const dw = cv.videoWidth * scale;
        const dh = cv.videoHeight * scale;
        ctx.drawImage(cv, x - dw / 2, y - dh / 2, dw, dh);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, r * 0.04);
        ctx.strokeStyle = "rgba(255,255,255,0.92)";
        ctx.stroke();
      }
    }
  }, []);

  const stopTracks = useCallback(() => {
    for (const ref of [screenStreamRef, micStreamRef, camStreamRef]) {
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current = null;
    }
    screenVideoRef.current = null;
    camVideoRef.current = null;
    camEnabledRef.current = false;
  }, []);

  const teardownMeter = useCallback(() => {
    cancelAnimationFrame(meterRafRef.current);
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevels(ZERO_LEVELS);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop(); // onstop builds the clip + tears down
  }, []);

  const startTimer = useCallback(() => {
    lastTickRef.current = Date.now();
    elapsedMsRef.current = 0;
    pausedRef.current = false;
    timerRef.current = window.setInterval(() => {
      const now = Date.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      if (pausedRef.current) return;
      elapsedMsRef.current += dt;
      const sec = Math.floor(elapsedMsRef.current / 1000);
      setElapsedSec(sec);
      if (sec >= MAX_RECORDING_SEC) stop();
    }, 250);
  }, [stop]);

  /** Acquire the screen + build the canvas. Mic/cam are reused from the preview. */
  const prepare = useCallback(
    async (opts: { source: CaptureSource }) => {
      setError(null);
      setRecorded(null);
      if (!recorderSupported()) {
        setError("Screen recording isn't supported here. Use desktop Chrome, Edge, or Firefox.");
        setStatus("error");
        return false;
      }
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30, displaySurface: SURFACE[opts.source] } as MediaTrackConstraints,
          audio: false,
        });
        if (!mountedRef.current) {
          screen.getTracks().forEach((t) => t.stop()); // unmounted while the picker was open
          return false;
        }
        screenStreamRef.current = screen;

        // Mic (reuse preview, else acquire) so we can mix it into the recording.
        // Best-effort: a denied/absent mic still yields a (silent) recording
        // rather than failing the whole capture.
        if (!micStreamRef.current) {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
          if (mic && !mountedRef.current) {
            mic.getTracks().forEach((t) => t.stop());
            stopTracks();
            return false;
          }
          if (mic) {
            micStreamRef.current = mic;
            attachMeter(mic);
          }
        }
        micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOnRef.current));

        const sv = document.createElement("video");
        sv.muted = true;
        sv.playsInline = true;
        sv.srcObject = screen;
        await sv.play();
        screenVideoRef.current = sv;

        const track = screen.getVideoTracks()[0];
        const settings = track.getSettings();
        const w = Math.round(settings.width ?? 1280);
        const h = Math.round(settings.height ?? 720);
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas not ready.");
        canvas.width = w;
        canvas.height = h;

        const r = Math.round(Math.min(w, h) * 0.13);
        bubbleRef.current = { x: w - r - 28, y: h - r - 28, r };

        if (cameraOn && camStreamRef.current) {
          const cv = document.createElement("video");
          cv.muted = true;
          cv.playsInline = true;
          cv.srcObject = camStreamRef.current;
          await cv.play();
          camVideoRef.current = cv;
          camEnabledRef.current = true;
        } else {
          camEnabledRef.current = false;
        }

        if (!mountedRef.current) {
          stopTracks();
          return false;
        }

        // The browser's own "Stop sharing" control ends the screen track.
        track.addEventListener("ended", () => stop());

        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(draw);
        setStatus("ready");
        return true;
      } catch (err) {
        setError(humanError(err));
        setStatus("error");
        cancelAnimationFrame(rafRef.current);
        stopTracks();
        return false;
      }
    },
    [attachMeter, cameraOn, draw, stop, stopTracks],
  );

  /** Start MediaRecorder once the screen is prepared (after the countdown). */
  const beginRecording = useCallback(() => {
    const canvas = canvasRef.current;
    const mic = micStreamRef.current;
    // Don't start against a stale/ended screen (e.g. user hit "Stop sharing"
    // during the countdown, or the component is tearing down).
    const vtrack = screenStreamRef.current?.getVideoTracks()[0];
    if (!canvas || !vtrack || vtrack.readyState !== "live") return;
    try {
      const canvasStream = canvas.captureStream(CAPTURE_FPS);
      const mixed = new MediaStream();
      canvasStream.getVideoTracks().forEach((t) => mixed.addTrack(t));
      if (mic) mic.getAudioTracks().forEach((t) => mixed.addTrack(t));

      const mimeType = pickMime();
      // Cap the bitrate (~0.08 bits/pixel/frame, clamped). MediaRecorder's default
      // can be very high, producing bloated files that upload slowly and buffer/seek
      // poorly on playback. This keeps quality while making files much leaner.
      const videoBitsPerSecond = Math.min(
        8_000_000,
        Math.max(1_500_000, Math.round(canvas.width * canvas.height * CAPTURE_FPS * 0.08)),
      );
      const rec = new MediaRecorder(mixed, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond,
        audioBitsPerSecond: 128_000,
      });
      mimeTypeRef.current = rec.mimeType || mimeType || "video/webm";
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        const url = URL.createObjectURL(blob);
        const durationSec = Math.round(elapsedMsRef.current / 1000);
        const finish = (thumbnailBlob: Blob | null) => {
          setRecorded({ blob, url, mimeType: mimeTypeRef.current, durationSec, thumbnailBlob });
          setStatus("recorded");
        };
        const c = canvasRef.current;
        stopTimer();
        cancelAnimationFrame(rafRef.current);
        if (c) c.toBlob((tb) => finish(tb), "image/jpeg", 0.7);
        else finish(null);
        stopTracks();
        teardownMeter(); // release the AudioContext + meter rAF once recording ends
      };
      rec.start(1000);
      recorderRef.current = rec;
      startTimer();
      setStatus("recording");
    } catch (err) {
      setError(humanError(err));
      setStatus("error");
    }
  }, [startTimer, stopTimer, stopTracks, teardownMeter]);

  const pause = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      rec.pause();
      pausedRef.current = true;
      setStatus("paused");
    }
  }, []);

  const resume = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "paused") {
      rec.resume();
      pausedRef.current = false;
      lastTickRef.current = Date.now();
      setStatus("recording");
    }
  }, []);

  /** Mute / unmute the mic mid-recording (track stays in the mix, silenced). */
  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      const next = !on;
      micOnRef.current = next;
      micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  /** Turn the webcam bubble on/off mid-recording. */
  const toggleCamera = useCallback(() => {
    setCameraOn((on) => {
      const next = !on;
      if (next && camStreamRef.current) {
        const cv = camVideoRef.current ?? document.createElement("video");
        cv.muted = true;
        cv.playsInline = true;
        cv.srcObject = camStreamRef.current;
        void cv.play().catch(() => undefined);
        camVideoRef.current = cv;
        camEnabledRef.current = true;
      } else {
        camEnabledRef.current = false;
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    if (recorded?.url) URL.revokeObjectURL(recorded.url);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
    cancelAnimationFrame(rafRef.current);
    stopTimer();
    stopTracks();
    teardownMeter();
    setRecorded(null);
    setElapsedSec(0);
    setError(null);
    setStatus("idle");
  }, [recorded, stopTimer, stopTracks, teardownMeter]);

  // Drag the webcam bubble on the canvas (canvas-space coords via the bounding rect).
  const toCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!camEnabledRef.current) return;
      const p = toCanvasPoint(e.clientX, e.clientY);
      const b = bubbleRef.current;
      if (p && Math.hypot(p.x - b.x, p.y - b.y) <= b.r) {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [toCanvasPoint],
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const canvas = canvasRef.current;
      const p = toCanvasPoint(e.clientX, e.clientY);
      if (!canvas || !p) return;
      const b = bubbleRef.current;
      b.x = Math.min(canvas.width - b.r, Math.max(b.r, p.x));
      b.y = Math.min(canvas.height - b.r, Math.max(b.r, p.y));
    },
    [toCanvasPoint],
  );

  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(meterRafRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      for (const ref of [screenStreamRef, micStreamRef, camStreamRef]) {
        ref.current?.getTracks().forEach((t) => t.stop());
      }
      audioCtxRef.current?.close().catch(() => undefined);
    };
  }, []);

  return {
    canvasRef,
    camPreviewRef,
    status,
    elapsedSec,
    error,
    recorded,
    cameraOn,
    micOn,
    levels,
    startPreview,
    setPreviewCamera,
    setPreviewMic,
    prepare,
    beginRecording,
    pause,
    resume,
    stop,
    reset,
    toggleMic,
    toggleCamera,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
  };
}
