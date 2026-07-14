/**
 * Rolling-window live classification for RTMS capture (Phase 2).
 *
 * The live path can't wait for a full transcript, so the worker classifies the
 * conversation in windows: accumulate segments → when shouldClassify() fires,
 * build a prompt from the unprocessed window (+ a small already-processed context
 * tail) → parse strict JSON → drop low-confidence + duplicate items. Same
 * precision-over-recall philosophy as src/lib/meetings/extract.ts: a human
 * confirms every item, so noise is worse than a miss.
 *
 * Pure — no DB, no network, no timers. The worker supplies segments, clock, and
 * the LLM call. Unit-tested in tests/zoom-rtms.test.ts.
 */

export type LiveSegment = {
  ts: number; // ms since epoch (RTMS segment timestamp, or receipt time)
  speaker: string; // Zoom display name
  roleLabel: string; // resolved role label ("client" | "va" | ... | "unknown")
  text: string;
};

export type LiveProposedItem = {
  kind: "task" | "project";
  title: string;
  description?: string;
  suggestedAssignee?: string;
  suggestedDueDate?: string; // YYYY-MM-DD
  clientContext?: string;
  confidence: number; // 0..1
  evidenceQuote?: string;
};

// ── Window scheduling ────────────────────────────────────────────────────────

export type ClassifyGateInput = {
  unclassifiedChars: number;
  msSinceLastClassify: number; // Infinity when never classified
  sessionEnding: boolean; // final sweep — flush whatever is left
};

export const LIVE_CLASSIFY_DEFAULTS = {
  minChars: 300, // don't wake the model for a sentence fragment
  maxChars: 2500, // a backlog this big classifies immediately
  debounceMs: 25_000, // otherwise at most one call per this interval
  windowMaxChars: 8000, // hard cap of new text per call (long backlogs chunk)
  contextTailChars: 900, // already-classified tail included as context
  minConfidence: 0.5, // proposed items below this are dropped (logged)
};

/** Should the worker run a classification pass now? */
export function shouldClassify(input: ClassifyGateInput, opts = LIVE_CLASSIFY_DEFAULTS): boolean {
  if (input.unclassifiedChars <= 0) return false;
  if (input.sessionEnding) return true;
  if (input.unclassifiedChars >= opts.maxChars) return true;
  return input.unclassifiedChars >= opts.minChars && input.msSinceLastClassify >= opts.debounceMs;
}

const segLine = (s: LiveSegment) => `[${s.roleLabel}] ${s.speaker}: ${s.text}`;

/**
 * Take the next window of unprocessed segments starting at `startIdx`, capped at
 * `maxChars` (always at least one segment). Returns the formatted window text and
 * the index the cursor should advance to.
 */
export function takeWindow(
  segments: LiveSegment[],
  startIdx: number,
  maxChars = LIVE_CLASSIFY_DEFAULTS.windowMaxChars,
): { text: string; nextIdx: number } {
  const lines: string[] = [];
  let chars = 0;
  let i = startIdx;
  for (; i < segments.length; i++) {
    const line = segLine(segments[i]);
    if (lines.length > 0 && chars + line.length > maxChars) break;
    lines.push(line);
    chars += line.length + 1;
  }
  return { text: lines.join("\n"), nextIdx: i };
}

/** The tail of already-classified conversation, for context only. */
export function contextTail(
  segments: LiveSegment[],
  endIdx: number,
  maxChars = LIVE_CLASSIFY_DEFAULTS.contextTailChars,
): string {
  const lines: string[] = [];
  let chars = 0;
  for (let i = endIdx - 1; i >= 0 && chars < maxChars; i--) {
    const line = segLine(segments[i]);
    lines.unshift(line);
    chars += line.length + 1;
  }
  return lines.join("\n");
}

/** Total characters of formatted text in segments[startIdx..]. */
export function unclassifiedChars(segments: LiveSegment[], startIdx: number): number {
  let chars = 0;
  for (let i = startIdx; i < segments.length; i++) chars += segLine(segments[i]).length + 1;
  return chars;
}

// ── Prompt ───────────────────────────────────────────────────────────────────
// Derived from the Phase-1 EXTRACTION_SYSTEM (post-meeting-work-only, precision
// first) with the live-specific additions: speaker roles as signals, kind
// (task vs project), confidence + evidence, already-proposed dedup, and
// window-boundary discipline.

export const LIVE_EXTRACTION_SYSTEM = [
  "You watch a LIVE meeting transcript for a virtual-assistant team, delivered in rolling windows.",
  "Extract only REAL post-meeting commitments — work someone still has to do AFTER the call ends.",
  "",
  'Each transcript line is "[role] Name: text" — role is the speaker\'s relationship to the team',
  "(client, va, team lead, staff, or unknown). Use role as a signal:",
  "- A client asking for something to be done later is a strong delegatable-task signal.",
  '- A va/staff member saying "I\'ll …" is usually a self-assigned task (suggestedAssignee = that speaker).',
  "- Ownerless brainstorming, live screen-work, and status updates are NOT items.",
  "",
  "Return ONLY a JSON array (no prose, no markdown fence). Each element:",
  '{ "kind": "task" | "project",',
  '  "title": string (imperative, <=80 chars),',
  '  "description"?: string (1-2 sentences of context),',
  "  \"suggestedAssignee\"?: string (a person's name — only when the owner is clear),",
  '  "suggestedDueDate"?: string (YYYY-MM-DD, only if a clear deadline was stated),',
  '  "clientContext"?: string (client/org the item is about, if clear),',
  '  "confidence": number 0..1 (how sure you are this is a real post-meeting commitment),',
  '  "evidenceQuote": string (the shortest verbatim quote that grounds the item) }',
  "",
  'kind "task" = one concrete next action. kind "project" = clearly multi-step work with no single',
  "next action (it gets routed to project planning instead of a one-off task).",
  "",
  "DO NOT extract:",
  "- Anything already handled DURING the meeting (a file shared, a question answered, a screen shown).",
  '- In-meeting mechanics: "share your screen", "can you see this", "unmute", "next slide", "one sec".',
  "- Discussion, opinions, status updates, FYIs, or hypotheticals with no owner or next step.",
  "- Anything listed under ALREADY PROPOSED (those are captured — never repeat or rephrase them).",
  "- Half-stated commitments that are still being negotiated at the window's edge — omit them; only",
  "  extract what is fully committed inside this window.",
  "",
  "Lines above the NEW-TRANSCRIPT marker are earlier context only — never extract from them.",
  'Test each candidate: "Does this still need doing after everyone hangs up?" If unsure, OMIT it —',
  "a human reviews every item, so noise is worse than a miss.",
  "If there are no real post-meeting commitments in this window, return [].",
].join("\n");

export const NEW_TRANSCRIPT_MARKER = "──── NEW TRANSCRIPT (extract only from below) ────";

export type LiveWindowInput = {
  meetingTitle: string;
  dateIso: string | null;
  rosterLines: string[]; // "[va] Aira Mangila (matched: Aira Mangila)" etc.
  alreadyProposed: string[]; // titles already proposed this meeting
  contextText: string; // may be ""
  windowText: string;
};

export function buildLiveMessages(input: LiveWindowInput): { role: "system" | "user"; content: string }[] {
  const header = [
    `MEETING: ${input.meetingTitle || "(untitled)"}`,
    input.dateIso ? `DATE: ${input.dateIso.slice(0, 10)}` : "",
    input.rosterLines.length ? `PARTICIPANTS:\n${input.rosterLines.map((l) => `- ${l}`).join("\n")}` : "",
    `ALREADY PROPOSED:\n${
      input.alreadyProposed.length ? input.alreadyProposed.map((t) => `- ${t}`).join("\n") : "- (none yet)"
    }`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const transcript = input.contextText
    ? `${input.contextText}\n${NEW_TRANSCRIPT_MARKER}\n${input.windowText}`
    : `${NEW_TRANSCRIPT_MARKER}\n${input.windowText}`;

  return [
    { role: "system", content: LIVE_EXTRACTION_SYSTEM },
    { role: "user", content: `${header}\n\nTRANSCRIPT WINDOW:\n${transcript}` },
  ];
}

// ── Output parsing + dedup ───────────────────────────────────────────────────

/**
 * Parse + validate model output. Mirrors parseExtractedItems: null = unparseable
 * (caller retries the same window later); [] = a valid "nothing here". Items with
 * an unrecognized kind (e.g. the model volunteering "in_meeting") are dropped.
 */
export function parseLiveItems(text: string): LiveProposedItem[] | null {
  if (typeof text !== "string") return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const items: LiveProposedItem[] = [];
  for (const el of raw) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const title = str(o.title);
    if (!title) continue;
    const kindRaw = str(o.kind)?.toLowerCase();
    if (kindRaw !== "task" && kindRaw !== "project") continue;
    const dueRaw = str(o.suggestedDueDate);
    const due = dueRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : undefined;
    const confRaw = typeof o.confidence === "number" ? o.confidence : 0.5;
    items.push({
      kind: kindRaw,
      title: title.slice(0, 200),
      description: str(o.description),
      suggestedAssignee: str(o.suggestedAssignee),
      suggestedDueDate: due,
      clientContext: str(o.clientContext),
      confidence: Math.min(1, Math.max(0, confRaw)),
      evidenceQuote: str(o.evidenceQuote)?.slice(0, 500),
    });
  }
  return items;
}

/** Normalized dedup key for a proposed title. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is `title` a duplicate of one already proposed? Exact normalized match, or a
 * containment match when the shorter side is substantial (≥ 12 chars) — catches
 * "send the payroll csv" vs "send the payroll csv to dan" without collapsing
 * short generic titles into each other.
 */
export function isDuplicateTitle(title: string, existing: Iterable<string>): boolean {
  const key = titleKey(title);
  if (!key) return true; // an empty title is never a new item
  for (const other of existing) {
    const otherKey = titleKey(other);
    if (!otherKey) continue;
    if (key === otherKey) return true;
    const shorter = key.length <= otherKey.length ? key : otherKey;
    const longer = key.length <= otherKey.length ? otherKey : key;
    if (shorter.length >= 12 && longer.includes(shorter)) return true;
  }
  return false;
}
