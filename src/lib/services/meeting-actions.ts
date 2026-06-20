// Pure helpers for the Meeting Actions confirm/skip flow — unit-testable.

export type ItemStatus = "PENDING" | "CONFIRMED" | "SKIPPED";

/** A MeetingAction is resolved once it has items and none is still PENDING. */
export function allItemsResolved(items: { status: ItemStatus }[]): boolean {
  return items.length > 0 && items.every((i) => i.status !== "PENDING");
}

/**
 * Best-effort match of a transcript-suggested assignee name to a known user id.
 * Case-insensitive; matches when either name contains the other (handles
 * "Aira" ↔ "Aira Mangila"). Returns the first match or null.
 *
 * Intentionally loose: a short suggestion ("Ana") can match a longer name
 * ("Anabel") and ties go to the first user in the list. That's fine — this only
 * pre-selects the assignee dropdown, which the reviewer can override before
 * confirming.
 */
export function matchAssignee(
  suggested: string | null | undefined,
  users: { id: string; name: string | null }[],
): string | null {
  const s = (suggested ?? "").trim().toLowerCase();
  if (!s) return null;
  for (const u of users) {
    const n = (u.name ?? "").trim().toLowerCase();
    if (!n) continue;
    if (n === s || n.includes(s) || s.includes(n)) return u.id;
  }
  return null;
}
