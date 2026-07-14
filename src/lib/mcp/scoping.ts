// Pure filter / query-shape helpers for tenant-scoped MCP reads. Kept
// DB-free and side-effect-free so they're unit-testable without a live
// database — the DB-touching call sites (list_projects's in-memory filter,
// list_tasks's Prisma where-clause) are thin wrappers around these.

// "No filter" is exactly `undefined` (the caller didn't ask for one) — NOT a
// falsy check. Any string, including '', is treated as a real filter value
// (an empty-string filter just matches zero rows, since clientOrganizationId
// is never '' in practice). This means no string input can ever cause these
// helpers to silently return everything — only omitting the arg can.
export function filterProjectsByClientOrg<T extends { clientOrganizationId: string | null }>(
  rows: T[],
  clientOrgId: string | undefined,
): T[] {
  if (clientOrgId === undefined) return rows;
  return rows.filter((r) => r.clientOrganizationId === clientOrgId);
}

export function taskClientOrgWhere(clientOrgId: string | undefined): { clientOrganizationId: string } | Record<string, never> {
  return clientOrgId === undefined ? {} : { clientOrganizationId: clientOrgId };
}
