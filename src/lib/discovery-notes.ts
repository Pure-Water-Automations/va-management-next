/**
 * Structured discovery-call notes — the SOP capture block a rep fills during/after
 * the call. Pure data + normalization, shared by the notes form and the server
 * action so the two never drift. Mirrors the recruitment interview-rubric pattern.
 */

export const BUYING_SIGNALS = ["cold", "curious", "warm", "hot"] as const;
export const DECISION_TYPES = ["individual", "committee", "board", "pastor"] as const;

export type DiscoveryNotes = {
  currentSituation: string;
  painPoints: string;
  desiredOutcome: string;
  costOfInaction: string;
  recommendedPackage: string;
  buyingSignals: string; // one of BUYING_SIGNALS, or ""
  objections: string;
  decisionProcess: string; // one of DECISION_TYPES, or ""
  nextStep: string;
  followUpDate: string; // "YYYY-MM-DD" or ""
};

/** The free-text fields, in display order (used by the form + the summary). */
export const NOTE_TEXT_FIELDS: { key: keyof DiscoveryNotes; label: string; long?: boolean }[] = [
  { key: "currentSituation", label: "Current situation", long: true },
  { key: "painPoints", label: "Pain points", long: true },
  { key: "desiredOutcome", label: "Desired finish line", long: true },
  { key: "costOfInaction", label: "Cost of inaction" },
  { key: "recommendedPackage", label: "Recommended package" },
  { key: "objections", label: "Objections", long: true },
  { key: "nextStep", label: "Next step" },
];

const cap = (v: unknown, n: number) => (typeof v === "string" ? v.trim() : "").slice(0, n);

function pick(v: unknown, allowed: readonly string[]): string {
  const s = cap(v, 40).toLowerCase();
  return (allowed as readonly string[]).includes(s) ? s : "";
}

function normalizeDate(v: unknown): string {
  const s = cap(v, 20);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return "";
  const [, y, mo, d] = m;
  // Round-trip so impossible dates (e.g. 2026-99-99, 2026-02-31) are rejected.
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  const ok = dt.getUTCFullYear() === +y && dt.getUTCMonth() === +mo - 1 && dt.getUTCDate() === +d;
  return ok ? s : "";
}

/** Coerce arbitrary form input into the structured, length-bounded notes shape. */
export function normalizeDiscoveryNotes(raw: Record<string, unknown>): DiscoveryNotes {
  return {
    currentSituation: cap(raw.currentSituation, 2000),
    painPoints: cap(raw.painPoints, 2000),
    desiredOutcome: cap(raw.desiredOutcome, 2000),
    costOfInaction: cap(raw.costOfInaction, 500),
    recommendedPackage: cap(raw.recommendedPackage, 200),
    buyingSignals: pick(raw.buyingSignals, BUYING_SIGNALS),
    objections: cap(raw.objections, 2000),
    decisionProcess: pick(raw.decisionProcess, DECISION_TYPES),
    nextStep: cap(raw.nextStep, 500),
    followUpDate: normalizeDate(raw.followUpDate),
  };
}

/** True if the rep actually entered something (so we don't store an empty blob). */
export function notesHaveContent(n: DiscoveryNotes): boolean {
  return Object.values(n).some((v) => v !== "");
}
