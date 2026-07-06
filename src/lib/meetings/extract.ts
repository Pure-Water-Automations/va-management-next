// Pure, dependency-free helpers for turning a harvested Zoom transcript Markdown
// file into a strict list of proposed action items. No DB, no network, no fs —
// all unit-testable. The worker supplies file contents + the LLM call; this
// module parses, filters, and validates. (Per the local-AI-gateway routing
// guide: keep the cross-cutting reasoning — frontmatter parse + strict JSON
// validation — in code, not the model.)

export type MeetingMeta = {
  title: string;
  zoomAccount: string | null;
  date: Date | null;
  body: string;
};

export type ProposedItem = {
  title: string;
  description?: string;
  suggestedAssignee?: string;
  suggestedDueDate?: string; // YYYY-MM-DD as returned by the model
  clientContext?: string;
};

// In-scope accounts (per the approved spec). PWA / PWA OS transcripts also exist
// in the mirror but are out-of-scope for v1; add them here to widen coverage.
export const ALLOWED_ACCOUNTS = new Set(["Northeast", "Business (BFC)"]);

// Meetings that are NOT Justin's (harvester attribution notes):
// FGS Video review = Zawadi; NE PWA Projects = Zawadi + Aira.
export const EXCLUDED_TITLE_PATTERNS = [/fgs video review/i, /ne pwa projects/i];

/** Parse flat YAML frontmatter + body from a harvested Meetings/*.md file. */
export function parseMeetingFile(md: string): MeetingMeta {
  md = md.replace(/\r\n/g, "\n");
  let title = "";
  let zoomAccount: string | null = null;
  let dateStr: string | undefined;
  let body = md;

  const fm = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fm) {
    const [, frontmatter, rest] = fm;
    body = rest;
    for (const line of frontmatter.split("\n")) {
      const m = line.match(/^([a-z_]+):\s*(.*)$/i);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^"(.*)"$/, "$1");
      if (key === "title") title = val;
      else if (key === "zoom_account") zoomAccount = val || null;
      // Date lives in recording_start (Zoom API) OR meeting_date (Gmail summary).
      else if ((key === "recording_start" || key === "meeting_date") && !dateStr) dateStr = val;
    }
  }

  const date = dateStr ? new Date(dateStr) : null;
  return {
    title,
    zoomAccount,
    date: date && !isNaN(date.getTime()) ? date : null,
    body: body.trim(),
  };
}

/** Whether a parsed meeting is in scope for extraction. */
export function shouldProcess(meta: { zoomAccount: string | null; title: string }): boolean {
  if (!meta.zoomAccount || !ALLOWED_ACCOUNTS.has(meta.zoomAccount)) return false;
  if (EXCLUDED_TITLE_PATTERNS.some((re) => re.test(meta.title))) return false;
  return true;
}

/**
 * Recency floor: process a transcript only if its meeting date is within
 * `maxAgeDays` of `now`. Keeps the worker from backfilling months of historical
 * meetings (whose action items are likely already stale/done). A null/unknown
 * date is treated as in-window — dateless files are rare and harmless to process,
 * and we never want to silently drop a recent one for lack of a parsable date.
 */
export function isRecentEnough(date: Date | null, now: Date, maxAgeDays: number): boolean {
  if (!date) return true;
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

// Precision matters more than recall here: a human confirms every item, so a missed
// task is cheaper than a queue full of noise. The hard part is teaching the model that
// an "action item" is POST-meeting work — not something already handled on the call
// (a file shared, a screen shown) and not in-meeting mechanics ("share your screen").
const EXTRACTION_SYSTEM = [
  "You extract action items from a meeting transcript for a virtual-assistant team.",
  "An action item is work that STILL NEEDS TO BE DONE AFTER THIS MEETING ENDS — a future",
  "deliverable, follow-up, or commitment with a clear owner.",
  "",
  "Return ONLY a JSON array (no prose, no markdown fence). Each element:",
  '{ "title": string (imperative, <=80 chars), "description"?: string (1-2 sentences of context),',
  '  "suggestedAssignee"?: string (a person\'s name explicitly tasked),',
  '  "suggestedDueDate"?: string (YYYY-MM-DD, only if a clear deadline was stated),',
  '  "clientContext"?: string (client/org the item is about, if clear) }',
  "",
  "DO capture: a promise to send/build/prepare/follow up on something later; a decision that",
  "requires someone to act after the call; a deliverable due by a date.",
  "",
  "DO NOT capture (these are NOT action items):",
  "- Anything already done or resolved DURING the meeting. If a request is handled on the call",
  "  (a file shared, a doc pulled up, a question answered, a screen shown), it is NOT an item.",
  '- In-meeting mechanics / real-time facilitation: "share your screen", "can you see this",',
  '  "can you see my screen", "unmute", "let me present/share", "scroll down", "next slide",',
  '  "pull that up", "one second".',
  "- Discussion, opinions, status updates, FYIs, or hypotheticals with no owner or next step.",
  "",
  'Test each candidate: "Does this still need doing after everyone hangs up?" If it could be',
  "fully satisfied within the call, or you're unsure it carries past the meeting, OMIT it.",
  "",
  "Ground every item in something actually said. Never invent assignees, dates, or clients —",
  "omit a field rather than guess. If there are no real post-meeting action items, return [].",
].join("\n");

/** Build the chat messages for the extraction call. `maxBodyChars` trims long transcripts. */
export function buildExtractionMessages(
  meta: MeetingMeta,
  maxBodyChars = 24000,
): { role: "system" | "user"; content: string }[] {
  const header = [
    `MEETING: ${meta.title || "(untitled)"}`,
    meta.date ? `DATE: ${meta.date.toISOString().slice(0, 10)}` : "",
    meta.zoomAccount ? `ACCOUNT: ${meta.zoomAccount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const body =
    meta.body.length > maxBodyChars ? meta.body.slice(0, maxBodyChars) + "\n…[truncated]" : meta.body;
  return [
    { role: "system", content: EXTRACTION_SYSTEM },
    { role: "user", content: `${header}\n\nTRANSCRIPT:\n${body}` },
  ];
}

/**
 * Parse + validate the model output. Returns:
 *  - ProposedItem[]  for a valid array (possibly empty)
 *  - null            for unparseable output (caller skips file → retried)
 */
export function parseExtractedItems(text: string): ProposedItem[] | null {
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
  const items: ProposedItem[] = [];
  for (const el of raw) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const title = str(o.title);
    if (!title) continue;
    const dueRaw = str(o.suggestedDueDate);
    const due = dueRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : undefined;
    items.push({
      title: title.slice(0, 200),
      description: str(o.description),
      suggestedAssignee: str(o.suggestedAssignee),
      suggestedDueDate: due,
      clientContext: str(o.clientContext),
    });
  }
  return items;
}
