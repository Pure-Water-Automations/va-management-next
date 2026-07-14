/**
 * Notion two-way sync — PURE logic (no DB, no network), unit-tested.
 *
 * The console syncs ONE field both directions: status. Everything else lives in
 * Notion and is reachable via a page link kept in the item's description. To map
 * the console's fixed status enums onto whatever option names a client uses in
 * their Notion database, we fuzzy-match by name and store the result as a
 * `statusMap`. A per-item `notionStatus` (the last option name we synced) is the
 * ping-pong guard that tells us which side changed since the last sync.
 */

export type NotionKind = "project" | "task";

/** statusMap shape stored on NotionConnection.statusMap (Json). */
export type StatusMap = {
  project?: Record<string, string>;
  task?: Record<string, string>;
  /** Resolved at connect time so push/poll never re-fetch the DB schema. */
  meta?: {
    projectStatusProp?: string;
    projectStatusType?: "status" | "select";
    projectTitleProp?: string;
    taskStatusProp?: string;
    taskStatusType?: "status" | "select";
    taskTitleProp?: string;
  };
};

export const PROJECT_STATUSES = ["Planning", "Active", "Done", "Paused"] as const;
export const TASK_STATUSES = ["NotStarted", "InProgress", "Done", "Blocked"] as const;

/** For each console status, Notion option names (lowercased) it should match, best first. */
const PROJECT_CANDIDATES: Record<string, string[]> = {
  Planning: ["planning", "planned", "not started", "to do", "todo", "backlog", "new", "idea"],
  Active: ["active", "in progress", "in-progress", "doing", "working", "started", "ongoing"],
  Done: ["done", "complete", "completed", "finished", "closed", "shipped", "live"],
  Paused: ["paused", "on hold", "on-hold", "hold", "blocked", "stalled", "waiting", "cancelled"],
};
const TASK_CANDIDATES: Record<string, string[]> = {
  NotStarted: ["not started", "not-started", "to do", "todo", "backlog", "new", "planned", "open"],
  InProgress: ["in progress", "in-progress", "doing", "working", "started", "active", "wip"],
  Done: ["done", "complete", "completed", "finished", "closed", "shipped"],
  Blocked: ["blocked", "on hold", "on-hold", "hold", "paused", "stalled", "waiting"],
};

function candidatesFor(kind: NotionKind): Record<string, string[]> {
  return kind === "project" ? PROJECT_CANDIDATES : TASK_CANDIDATES;
}

export function statusesFor(kind: NotionKind): readonly string[] {
  return kind === "project" ? PROJECT_STATUSES : TASK_STATUSES;
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Build a console-status -> Notion-option-name map for one kind, given the real
 * option names from the connected Notion database. A console status that can't be
 * confidently matched is left OUT of the map (sync is then a safe no-op for it,
 * rather than guessing). Each Notion option is used at most once.
 */
export function buildStatusMapForKind(kind: NotionKind, notionOptionNames: string[]): Record<string, string> {
  const options = notionOptionNames.filter((o) => typeof o === "string" && o.trim() !== "");
  const byNorm = new Map<string, string>();
  for (const o of options) if (!byNorm.has(norm(o))) byNorm.set(norm(o), o);

  const map: Record<string, string> = {};
  const used = new Set<string>();
  const cands = candidatesFor(kind);

  // Pass 1: exact option-name match against a candidate.
  for (const status of statusesFor(kind)) {
    for (const cand of cands[status]) {
      const hit = byNorm.get(cand);
      if (hit && !used.has(norm(hit))) {
        map[status] = hit;
        used.add(norm(hit));
        break;
      }
    }
  }
  // Pass 2: substring match for anything still unmatched (e.g. "In Progress (dev)").
  for (const status of statusesFor(kind)) {
    if (map[status]) continue;
    for (const cand of cands[status]) {
      const hit = options.find((o) => !used.has(norm(o)) && (norm(o).includes(cand) || cand.includes(norm(o))));
      if (hit) {
        map[status] = hit;
        used.add(norm(hit));
        break;
      }
    }
  }
  return map;
}

/** Console statuses with no Notion option mapped — surfaced as a warning at connect time. */
export function unmappedStatuses(kind: NotionKind, map: Record<string, string>): string[] {
  return statusesFor(kind).filter((s) => !map[s]);
}

/** Console status -> the Notion option name to write, or null if unmapped. */
export function vaStatusToNotionOption(
  kind: NotionKind,
  vaStatus: string,
  statusMap: StatusMap | null | undefined,
): string | null {
  const m = statusMap?.[kind];
  return (m && m[vaStatus]) || null;
}

/** Notion option name -> the console status, or null if it maps to nothing we track. */
export function notionOptionToVaStatus(
  kind: NotionKind,
  optionName: string | null | undefined,
  statusMap: StatusMap | null | undefined,
): string | null {
  if (!optionName) return null;
  const m = statusMap?.[kind];
  if (!m) return null;
  const target = norm(optionName);
  for (const status of statusesFor(kind)) {
    const mapped = m[status];
    if (mapped && norm(mapped) === target) return status;
  }
  return null;
}

const NOTION_LINK_PREFIX = "🔗 Notion: ";

/**
 * Ensure the item's description carries a link to its Notion page (idempotent).
 * The link is the one human-visible bridge to all the Notion-only properties we
 * deliberately don't import.
 */
export function ensureNotionLink(description: string | null | undefined, url: string): string {
  const body = (description ?? "").trimEnd();
  if (!url) return body;
  if (body.includes(url)) return description ?? body; // already linked — leave untouched
  const line = `${NOTION_LINK_PREFIX}${url}`;
  return body ? `${body}\n\n${line}` : line;
}

export type ReconcileResult =
  | { action: "none" }
  | { action: "applyToVa"; vaStatus: string; notionOption: string }
  | { action: "pushToNotion"; notionOption: string };

/**
 * Decide what a poll should do for one linked item, using `lastNotionStatus`
 * (the option name we last synced) as the which-side-changed guard:
 *
 *  - Notion option changed since last sync  -> Notion is newer  -> apply to console.
 *  - Notion unchanged but console status differs -> console changed (push maybe
 *    missed while Notion was offline) -> push to Notion.
 *  - Otherwise -> nothing.
 *
 * This is direction-agnostic and avoids ping-pong because every write also
 * records the resulting option name as the new `lastNotionStatus`.
 */
export function reconcilePoll(args: {
  kind: NotionKind;
  vaStatus: string;
  notionOption: string | null;
  lastNotionStatus: string | null;
  statusMap: StatusMap | null | undefined;
}): ReconcileResult {
  const { kind, vaStatus, notionOption, lastNotionStatus, statusMap } = args;

  const notionChanged =
    notionOption != null && (lastNotionStatus == null || norm(notionOption) !== norm(lastNotionStatus));

  if (notionChanged) {
    const mappedVa = notionOptionToVaStatus(kind, notionOption, statusMap);
    if (mappedVa && mappedVa !== vaStatus) {
      return { action: "applyToVa", vaStatus: mappedVa, notionOption: notionOption! };
    }
    return { action: "none" }; // unknown option or already equal — just refresh the cursor upstream
  }

  // Notion unchanged since last sync: did the console move without a successful push?
  const wantOption = vaStatusToNotionOption(kind, vaStatus, statusMap);
  if (wantOption && (notionOption == null || norm(wantOption) !== norm(notionOption))) {
    return { action: "pushToNotion", notionOption: wantOption };
  }
  return { action: "none" };
}
