"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORDING_SEC = 30 * 60; // hard stop
export const SOFT_WARN_SEC = 15 * 60; // soft warning

export type RecorderStatus = "idle" | "recording" | "paused" | "recorded" | "error";

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
  if (name === "NotAllowedError") return "Permission denied — allow screen and microphone access to record.";
  if (name === "NotFoundError") return "No microphone/camera found.";
  return err instanceof Error ? err.message : "Couldn't start recording.";
}

/**
 * Screen + mic (+ optional webcam bubble) capture, composited through a visible
 * canvas and recorded with MediaRecorder. The canvas IS the live preview, so the
 * bubble you drag is exactly what gets recorded. Returns handlers + a recorded clip.
 */
export function useScreenRecorder() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<RecordedClip | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

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
  const bubbleRef = useRef<Bubble>({ x: 0, y: 0, r: 0 });
  const draggingRef = useRef(false);

  // timer
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const elapsedMsRef = useRef(0);
  const pausedRef = useRef(false);

  const draw = useCallback(() => {
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
    rafRef.current = requestAnimationFrame(draw);
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

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // onstop builds the clip + tears down
    }
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

  const start = useCallback(
    async (opts: { camera: boolean }) => {
      setError(null);
      setRecorded(null);
      if (!recorderSupported()) {
        setError("Screen recording isn't supported here. Use desktop Chrome or Edge.");
        setStatus("error");
        return;
      }
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: false,
        });
        screenStreamRef.current = screen;

        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = mic;

        if (opts.camera) {
          const cam = await navigator.mediaDevices
            .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
            .catch(() => null);
          if (cam) camStreamRef.current = cam;
        }

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

        if (camStreamRef.current) {
          const cv = document.createElement("video");
          cv.muted = true;
          cv.playsInline = true;
          cv.srcObject = camStreamRef.current;
          await cv.play();
          camVideoRef.current = cv;
          camEnabledRef.current = true;
          setCameraOn(true);
        } else {
          setCameraOn(false);
        }

        // The browser's own "Stop sharing" control ends the screen track.
        track.addEventListener("ended", () => stop());

        rafRef.current = requestAnimationFrame(draw);

        const canvasStream = canvas.captureStream(30);
        const mixed = new MediaStream();
        canvasStream.getVideoTracks().forEach((t) => mixed.addTrack(t));
        mic.getAudioTracks().forEach((t) => mixed.addTrack(t));

        const mimeType = pickMime();
        const rec = new MediaRecorder(mixed, mimeType ? { mimeType } : undefined);
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
        };
        rec.start(1000);
        recorderRef.current = rec;

        startTimer();
        setStatus("recording");
      } catch (err) {
        setError(humanError(err));
        setStatus("error");
        cancelAnimationFrame(rafRef.current);
        stopTracks();
      }
    },
    [draw, startTimer, stop, stopTimer, stopTracks],
  );

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

  const reset = useCallback(() => {
    if (recorded?.url) URL.revokeObjectURL(recorded.url);
    setRecorded(null);
    setElapsedSec(0);
    setError(null);
    setStatus("idle");
  }, [recorded]);

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

  const setBubbleScale = useCallback((scale: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const b = bubbleRef.current;
    const r = Math.round(Math.min(canvas.width, canvas.height) * scale);
    b.r = r;
    b.x = Math.min(canvas.width - r, Math.max(r, b.x));
    b.y = Math.min(canvas.height - r, Math.max(r, b.y));
  }, []);

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      cancelAnimationFrame(rafRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      for (const ref of [screenStreamRef, micStreamRef, camStreamRef]) {
        ref.current?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return {
    canvasRef,
    status,
    elapsedSec,
    error,
    recorded,
    cameraOn,
    start,
    pause,
    resume,
    stop,
    reset,
    setBubbleScale,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
  };
}
