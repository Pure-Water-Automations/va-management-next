"use client";

// Draft autosave for the public funnels (/discover, /apply). A lead/applicant
// who reloads or wanders off can pick up where they left off. localStorage only
// — no server, no PII leaves the device beyond what they already typed locally.
//
// The pure core (serializeDraft/readDraft/draftAgeLabel) is unit-tested; the
// useDraft hook is the thin SSR-safe React wrapper around it.

import { useCallback, useEffect, useRef, useState } from "react";

type Stored<T> = { key: string; savedAt: number; state: T };

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEBOUNCE_MS = 1500;

/** Serialize state + a savedAt stamp + the owning key into a storable string. */
export function serializeDraft<T>(key: string, state: T, now: number): string {
  return JSON.stringify({ key, savedAt: now, state } satisfies Stored<T>);
}

/**
 * Parse a stored draft. Returns null on junk JSON, a missing/!number savedAt, a
 * key mismatch (foreign/stale draft), or anything older than maxAgeMs.
 */
export function readDraft<T>(
  key: string,
  raw: string | null,
  now: number,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): { state: T; savedAt: number } | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<Stored<T>>;
  if (typeof p.savedAt !== "number" || p.key !== key) return null;
  if (now - p.savedAt > maxAgeMs) return null;
  if (!("state" in p)) return null;
  return { state: p.state as T, savedAt: p.savedAt };
}

/** Coarse, human "N minutes/hours/days ago" (no lib). */
export function draftAgeLabel(savedAt: number, now: number): string {
  const s = Math.max(0, Math.floor((now - savedAt) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export type UseDraft = {
  hasDraft: boolean;
  draftAgeLabel: string | null;
  /** Restore the saved draft into the caller's state (via the `restore` callback). */
  resume: () => void;
  /** Forget the saved draft (also called automatically on successful submit). */
  discard: () => void;
};

/**
 * Debounced localStorage autosave + mount-time restore offer. SSR-safe.
 *
 * @param key      localStorage key (e.g. "pwa_discover_draft")
 * @param state    the current form state to persist (serializable)
 * @param restore  called with a saved state when the user chooses to resume
 */
export function useDraft<T>(key: string, state: T, restore: (s: T) => void): UseDraft {
  const [saved, setSaved] = useState<{ state: T; savedAt: number } | null>(null);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // Mount: read any existing draft and offer to resume it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSaved(readDraft<T>(key, window.localStorage.getItem(key), Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Debounced autosave whenever state changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(key, serializeDraft(key, state, Date.now()));
      } catch {
        /* quota/private-mode — best-effort, never throw into the form */
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key, state]);

  const resume = useCallback(() => {
    if (saved) restoreRef.current(saved.state);
    setSaved(null);
  }, [saved]);

  const discard = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    setSaved(null);
  }, [key]);

  return {
    hasDraft: saved !== null,
    draftAgeLabel: saved ? draftAgeLabel(saved.savedAt, Date.now()) : null,
    resume,
    discard,
  };
}
