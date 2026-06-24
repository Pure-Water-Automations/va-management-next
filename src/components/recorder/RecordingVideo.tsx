"use client";

import { forwardRef, useImperativeHandle, useRef, type VideoHTMLAttributes } from "react";

/**
 * <video> drop-in for recordings playback.
 *
 * Fixes the "clunky seek" problem with MediaRecorder WebM: those files are written
 * without a duration header or seek index, so the browser reports
 * `duration === Infinity` and refuses to scrub until the whole file has buffered
 * (it also silently breaks any percentage-of-duration trim math). On the first
 * metadata load we force the browser to resolve the real duration — seek to a huge
 * time so it lands at the true end, then snap back — after which the scrubber and
 * trim handles work immediately. Defaults to `preload="metadata"` for a faster
 * first paint. Forwards a ref to the underlying <video> so callers keep full control.
 */
export const RecordingVideo = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement>>(
  function RecordingVideo({ onLoadedMetadata, preload = "metadata", ...rest }, ref) {
    const innerRef = useRef<HTMLVideoElement | null>(null);
    const primedRef = useRef(false);
    useImperativeHandle(ref, () => innerRef.current as HTMLVideoElement, []);

    const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = innerRef.current;
      // Only prime once, and only when the duration is unusable (Infinity / NaN / 0).
      if (v && !primedRef.current && (!Number.isFinite(v.duration) || v.duration === 0)) {
        primedRef.current = true;
        const onSeeked = () => {
          v.removeEventListener("seeked", onSeeked);
          v.currentTime = 0; // snap back; callers re-position from their own handler
          onLoadedMetadata?.(e);
        };
        v.addEventListener("seeked", onSeeked);
        try {
          v.currentTime = 1e101; // forces the browser to compute the true duration
        } catch {
          v.removeEventListener("seeked", onSeeked);
          onLoadedMetadata?.(e);
        }
        return;
      }
      onLoadedMetadata?.(e);
    };

    return <video ref={innerRef} preload={preload} onLoadedMetadata={handleLoadedMetadata} {...rest} />;
  },
);
