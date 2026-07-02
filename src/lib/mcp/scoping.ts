// Pure filter / query-shape helpers for tenant-scoped MCP reads. Kept
// DB-free and side-effect-free so they're unit-testable without a live
// database — the DB-touching call sites (list_projects's in-memory filter,
// list_tasks's Prisma where-clause) are thin wrappers around these.

export function filterProjectsByClientOrg<T extends { clientOrganizationId: string | null }>(
  rows: T[],
  clientOrgId: string | undefined,
): T[] {
  if (!clientOrgId) return rows;
  return rows.filter((r) => r.clientOrganizationId === clientOrgId);
}

export function taskClientOrgWhere(clientOrgId: string | undefined): { clientOrganizationId: string } | Record<string, never> {
  return clientOrgId ? { clientOrganizationId: clientOrgId } : {};
}
