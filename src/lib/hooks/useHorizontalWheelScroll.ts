"use client";

import { useEffect, useRef } from "react";

/**
 * Lets a plain vertical mouse wheel scroll a horizontally-overflowing nav.
 * Without this, only a trackpad's horizontal swipe (or shift+wheel) can move
 * it — invisible and undiscoverable for anyone on a regular mouse. Trackpad
 * horizontal swipes (deltaX-dominant) pass through untouched.
 */
export function useHorizontalWheelScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal input
      if (el!.scrollWidth <= el!.clientWidth) return; // nothing to scroll
      el!.scrollLeft += e.deltaY;
      e.preventDefault();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return ref;
}
