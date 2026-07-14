/**
 * Notion two-way sync — ENGINE (DB + Notion network). The pure decisions live in
 * lib/notion-sync; this wires them to Prisma + the Notion API. Everything here is
 * best-effort: a Notion outage must never break a console write, so callers fire
 * push/sync without awaiting hard failures.
 */
import type { NotionConnection } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type NotionConfig,
  notionCreatePage,
  notionPatch,
  notionQuery,
  notionResolveDataSourceId,
  notionRetrieveDataSource,
  notionPickStatusProperty,
  notionPickTitlePropertyName,
  notionPageStatusName,
  notionPageTitleText,
  notionPageUrl,
  notionPageIdOf,
  notionPageLastEdited,
  notionSearchDatabases,
  statusPropertyPayload,
  titlePropertyPayload,
} from "@/lib/notion";
import { classifyDatabases } from "@/lib/notion-classify";
import {
  type NotionKind,
  type StatusMap,
  buildStatusMapForKind,
  ensureNotionLink,
  notionOptionToVaStatus,
  reconcilePoll,
  unmappedStatuses,
  vaStatusToNotionOption,
} from "@/lib/notion-sync";

function cfg(conn: NotionConnection): NotionConfig {
  return { token: conn.token };
}
function mapOf(conn: NotionConnection): StatusMap {
  return (conn.statusMap as StatusMap | null) ?? {};
}
function dataSourceFor(conn: NotionConnection, kind: NotionKind): string | null {
  return kind === "project" ? conn.projectsDataSourceId : conn.tasksDataSourceId;
}
function statusPropFor(conn: NotionConnection, kind: NotionKind): { name: string; type: "status" | "select" } {
  const meta = mapOf(conn).meta ?? {};
  if (kind === "project")
    return { name: meta.projectStatusProp ?? conn.statusProperty, type: meta.projectStatusType ?? "status" };
  return { name: meta.taskStatusProp ?? conn.statusProperty, type: meta.taskStatusType ?? "status" };
}
function titlePropFor(conn: NotionConnection, kind: NotionKind): string {
  const meta = mapOf(conn).meta ?? {};
  return (kind === "project" ? meta.projectTitleProp : meta.taskTitleProp) ?? "Name";
}

export async function getConnection(clientOrganizationId: string): Promise<NotionConnection | null> {
  return db.notionConnection.findUnique({ where: { clientOrganizationId } });
}

export type ConnectInput = {
  clientOrganizationId: string;
  /** Manual internal-integration token. Omit to reuse the token already stored
   *  (e.g. from the OAuth connect, or to keep the current one on re-config). */
  token?: string | null;
  projectsDatabase?: string | null;
  tasksDatabase?: string | null;
  statusProperty?: string | null;
  createdByEmail?: string | null;
};

/** Store just the OAuth access token (no databases yet) — the UI then shows the
 *  database picker to finish configuring the connection. */
export async function storeOauthToken(input: {
  clientOrganizationId: string;
  token: string;
  createdByEmail?: string | null;
}): Promise<void> {
  await db.notionConnection.upsert({
    where: { clientOrganizationId: input.clientOrganizationId },
    update: { token: input.token, active: true, createdByEmail: input.createdByEmail ?? undefined },
    create: { clientOrganizationId: input.clientOrganizationId, token: input.token, active: true, createdByEmail: input.createdByEmail ?? undefined },
  });
}

export type DbOption = { id: string; title: string };

/** List the databases the connection's token can reach + an AI/heuristic guess of
 *  which is Projects vs Tasks (for the OAuth picker). */
export async function listConnectableDatabases(
  clientOrganizationId: string,
): Promise<{ databases: DbOption[]; suggestedProjects: string | null; suggestedTasks: string | null }> {
  const conn = await getConnection(clientOrganizationId);
  if (!conn?.token) throw new Error("Not connected to Notion yet");
  const databases = await notionSearchDatabases({ token: conn.token });
  const { projects, tasks } = await classifyDatabases(databases);
  return { databases, suggestedProjects: projects, suggestedTasks: tasks };
}

/** True when the connection has a token but no database wired up yet (post-OAuth,
 *  pre-picker). */
export async function needsDatabasePick(clientOrganizationId: string): Promise<boolean> {
  const conn = await getConnection(clientOrganizationId);
  return !!conn?.active && !!conn.token && !conn.projectsDataSourceId && !conn.tasksDataSourceId;
}

export type ConnectSummary = {
  projects?: { statusProperty: string; options: string[]; mapped: string[]; unmapped: string[] };
  tasks?: { statusProperty: string; options: string[]; mapped: string[]; unmapped: string[] };
};

/**
 * Validate the token + database(s) by reading their schema, auto-build the status
 * maps from the real option names, and upsert the connection. Throws on an invalid
 * token / unshared database so the UI can surface it.
 */
export async function connectNotion(input: ConnectInput): Promise<ConnectSummary> {
  // Reuse the already-stored token (OAuth or prior connect) when none is supplied.
  let token = input.token?.trim() || "";
  if (!token) {
    const existing = await getConnection(input.clientOrganizationId);
    token = existing?.token?.trim() || "";
  }
  if (!token) throw new Error("Connect with Notion (or paste an integration token) first");
  const c: NotionConfig = { token };
  const preferred = input.statusProperty?.trim() || "Status";
  const statusMap: StatusMap = { meta: {} };
  const summary: ConnectSummary = {};

  let projectsDatabaseId: string | null = null;
  let projectsDataSourceId: string | null = null;
  let tasksDatabaseId: string | null = null;
  let tasksDataSourceId: string | null = null;

  if (input.projectsDatabase?.trim()) {
    projectsDatabaseId = input.projectsDatabase.trim();
    projectsDataSourceId = await notionResolveDataSourceId(projectsDatabaseId, c);
    const ds = await notionRetrieveDataSource(projectsDataSourceId, c);
    const statusProp = notionPickStatusProperty(ds, preferred);
    const titleProp = notionPickTitlePropertyName(ds);
    const map = statusProp ? buildStatusMapForKind("project", statusProp.options) : {};
    statusMap.project = map;
    statusMap.meta!.projectStatusProp = statusProp?.name ?? preferred;
    statusMap.meta!.projectStatusType = statusProp?.type ?? "status";
    statusMap.meta!.projectTitleProp = titleProp;
    summary.projects = {
      statusProperty: statusProp?.name ?? preferred,
      options: statusProp?.options ?? [],
      mapped: Object.keys(map),
      unmapped: unmappedStatuses("project", map),
    };
  }

  if (input.tasksDatabase?.trim()) {
    tasksDatabaseId = input.tasksDatabase.trim();
    tasksDataSourceId = await notionResolveDataSourceId(tasksDatabaseId, c);
    const ds = await notionRetrieveDataSource(tasksDataSourceId, c);
    const statusProp = notionPickStatusProperty(ds, preferred);
    const titleProp = notionPickTitlePropertyName(ds);
    const map = statusProp ? buildStatusMapForKind("task", statusProp.options) : {};
    statusMap.task = map;
    statusMap.meta!.taskStatusProp = statusProp?.name ?? preferred;
    statusMap.meta!.taskStatusType = statusProp?.type ?? "status";
    statusMap.meta!.taskTitleProp = titleProp;
    summary.tasks = {
      statusProperty: statusProp?.name ?? preferred,
      options: statusProp?.options ?? [],
      mapped: Object.keys(map),
      unmapped: unmappedStatuses("task", map),
    };
  }

  await db.notionConnection.upsert({
    where: { clientOrganizationId: input.clientOrganizationId },
    update: {
      token: c.token,
      projectsDatabaseId,
      projectsDataSourceId,
      tasksDatabaseId,
      tasksDataSourceId,
      statusProperty: preferred,
      statusMap: statusMap as object,
      active: true,
      createdByEmail: input.createdByEmail ?? undefined,
    },
    create: {
      clientOrganizationId: input.clientOrganizationId,
      token: c.token,
      projectsDatabaseId,
      projectsDataSourceId,
      tasksDatabaseId,
      tasksDataSourceId,
      statusProperty: preferred,
      statusMap: statusMap as object,
      createdByEmail: input.createdByEmail ?? undefined,
    },
  });

  return summary;
}

export async function disconnectNotion(clientOrganizationId: string): Promise<void> {
  await db.notionConnection.deleteMany({ where: { clientOrganizationId } });
}

// ── Linking an existing console item -> a new Notion page ────────────────────

export async function linkProject(projectId: string): Promise<{ url: string }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, name: true, description: true, status: true, clientOrganizationId: true, notionPageId: true },
  });
  if (project.notionPageId) throw new Error("Project is already linked to Notion");
  if (!project.clientOrganizationId) throw new Error("Project has no client organization");
  const conn = await getConnection(project.clientOrganizationId);
  if (!conn?.active || !conn.projectsDataSourceId) throw new Error("This client has no connected Notion projects database");

  const { name: prop, type } = statusPropFor(conn, "project");
  const option = vaStatusToNotionOption("project", project.status, mapOf(conn));
  const props = {
    ...titlePropertyPayload(titlePropFor(conn, "project"), project.name),
    ...(option ? statusPropertyPayload(prop, type, option) : {}),
  };
  const page = await notionCreatePage(conn.projectsDataSourceId, props, cfg(conn));
  const url = notionPageUrl(page);
  const pageId = notionPageIdOf(page);

  await db.project.update({
    where: { id: project.id },
    data: {
      notionPageId: pageId,
      notionUrl: url,
      notionStatus: option,
      notionSyncedAt: new Date(),
      description: ensureNotionLink(project.description, url),
    },
  });
  return { url };
}

export async function linkTask(taskId: string): Promise<{ url: string }> {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, title: true, instructions: true, status: true, clientOrganizationId: true, projectId: true, notionPageId: true },
  });
  if (task.notionPageId) throw new Error("Task is already linked to Notion");

  let orgId = task.clientOrganizationId;
  if (!orgId && task.projectId) {
    const proj = await db.project.findUnique({ where: { id: task.projectId }, select: { clientOrganizationId: true } });
    orgId = proj?.clientOrganizationId ?? null;
  }
  if (!orgId) throw new Error("Task has no client organization");
  const conn = await getConnection(orgId);
  if (!conn?.active || !conn.tasksDataSourceId) throw new Error("This client has no connected Notion tasks database");

  const { name: prop, type } = statusPropFor(conn, "task");
  const option = vaStatusToNotionOption("task", task.status, mapOf(conn));
  const props = {
    ...titlePropertyPayload(titlePropFor(conn, "task"), task.title),
    ...(option ? statusPropertyPayload(prop, type, option) : {}),
  };
  const page = await notionCreatePage(conn.tasksDataSourceId, props, cfg(conn));
  const url = notionPageUrl(page);
  const pageId = notionPageIdOf(page);

  await db.task.update({
    where: { id: task.id },
    data: {
      notionPageId: pageId,
      notionUrl: url,
      notionStatus: option,
      notionSyncedAt: new Date(),
      instructions: ensureNotionLink(task.instructions, url),
    },
  });
  return { url };
}

// ── Console -> Notion status push (best-effort; called on status change) ─────

export async function pushProjectStatus(projectId: string): Promise<void> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true, notionPageId: true, notionStatus: true, clientOrganizationId: true },
  });
  if (!p?.notionPageId || !p.clientOrganizationId) return;
  const conn = await getConnection(p.clientOrganizationId);
  if (!conn?.active) return;
  const option = vaStatusToNotionOption("project", p.status, mapOf(conn));
  if (!option || option === p.notionStatus) return;
  const { name, type } = statusPropFor(conn, "project");
  await notionPatch(p.notionPageId, statusPropertyPayload(name, type, option), cfg(conn));
  await db.project.update({ where: { id: p.id }, data: { notionStatus: option, notionSyncedAt: new Date() } });
}

export async function pushTaskStatus(taskId: string): Promise<void> {
  const t = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, notionPageId: true, notionStatus: true, clientOrganizationId: true, projectId: true },
  });
  if (!t?.notionPageId) return;
  let orgId = t.clientOrganizationId;
  if (!orgId && t.projectId) {
    const proj = await db.project.findUnique({ where: { id: t.projectId }, select: { clientOrganizationId: true } });
    orgId = proj?.clientOrganizationId ?? null;
  }
  if (!orgId) return;
  const conn = await getConnection(orgId);
  if (!conn?.active) return;
  const option = vaStatusToNotionOption("task", t.status, mapOf(conn));
  if (!option || option === t.notionStatus) return;
  const { name, type } = statusPropFor(conn, "task");
  await notionPatch(t.notionPageId, statusPropertyPayload(name, type, option), cfg(conn));
  await db.task.update({ where: { id: t.id }, data: { notionStatus: option, notionSyncedAt: new Date() } });
}

/** Fire-and-forget wrappers for action hooks — never throw into the caller. */
export function pushProjectStatusSafe(projectId: string): void {
  void pushProjectStatus(projectId).catch((e) => console.error(`[notion] push project ${projectId}:`, String(e).split("\n")[0]));
}
export function pushTaskStatusSafe(taskId: string): void {
  void pushTaskStatus(taskId).catch((e) => console.error(`[notion] push task ${taskId}:`, String(e).split("\n")[0]));
}

// ── Notion -> Console poll (status reconcile + import new pages) ─────────────

export type SyncCounts = { imported: number; updated: number; pushed: number; skipped: number; errors: number };

async function resolveOwnerUserId(conn: NotionConnection): Promise<string | null> {
  if (conn.createdByEmail) {
    const u = await db.user.findUnique({ where: { email: conn.createdByEmail.toLowerCase() }, select: { id: true } });
    if (u) return u.id;
  }
  const member = await db.clientMembership.findFirst({
    where: { clientOrganizationId: conn.clientOrganizationId, user: { active: true } },
    select: { userId: true },
  });
  if (member) return member.userId;
  const admin = await db.user.findFirst({ where: { isAdmin: true, active: true }, select: { id: true } });
  return admin?.id ?? null;
}

export async function syncConnection(conn: NotionConnection): Promise<SyncCounts> {
  const counts: SyncCounts = { imported: 0, updated: 0, pushed: 0, skipped: 0, errors: 0 };
  const map = mapOf(conn);
  const c = cfg(conn);
  let newestCursor = conn.lastEditedCursor;
  const org = await db.clientOrganization.findUnique({ where: { id: conn.clientOrganizationId }, select: { name: true } });
  const ownerId = await resolveOwnerUserId(conn);

  for (const kind of ["project", "task"] as NotionKind[]) {
    const dataSourceId = dataSourceFor(conn, kind);
    if (!dataSourceId) continue;
    const { name: statusProp } = statusPropFor(conn, kind);

    const body: Record<string, unknown> = {
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
    };
    if (conn.lastEditedCursor) {
      body.filter = { timestamp: "last_edited_time", last_edited_time: { after: conn.lastEditedCursor } };
    }

    let pages: Record<string, unknown>[] = [];
    try {
      pages = await notionQuery(dataSourceId, body, c);
    } catch (e) {
      counts.errors++;
      console.error(`[notion] query ${kind} ds=${dataSourceId}:`, String(e).split("\n")[0]);
      continue;
    }

    for (const page of pages) {
      try {
        const pageId = notionPageIdOf(page);
        if (!pageId) continue;
        const lastEdited = notionPageLastEdited(page);
        if (lastEdited && (!newestCursor || lastEdited > newestCursor)) newestCursor = lastEdited;
        const statusName = notionPageStatusName(page, statusProp);
        const url = notionPageUrl(page);

        if (kind === "project") {
          const existing = await db.project.findUnique({
            where: { notionPageId: pageId },
            select: { id: true, status: true, notionStatus: true },
          });
          if (existing) {
            await applyProjectReconcile(conn, existing, statusName, counts);
          } else {
            await importProject(conn, page, pageId, url, statusName, org?.name ?? null, ownerId, counts);
          }
        } else {
          const existing = await db.task.findUnique({
            where: { notionPageId: pageId },
            select: { id: true, status: true, notionStatus: true },
          });
          if (existing) {
            await applyTaskReconcile(conn, existing, statusName, counts);
          } else {
            await importTask(conn, page, pageId, url, statusName, org?.name ?? null, ownerId, counts);
          }
        }
      } catch (e) {
        counts.errors++;
        console.error(`[notion] reconcile ${kind}:`, String(e).split("\n")[0]);
      }
    }
  }

  await db.notionConnection.update({
    where: { id: conn.id },
    data: { lastSyncedAt: new Date(), lastEditedCursor: newestCursor, lastSyncSummary: counts as object },
  });
  return counts;
}

async function applyProjectReconcile(
  conn: NotionConnection,
  existing: { id: string; status: string; notionStatus: string | null },
  statusName: string | null,
  counts: SyncCounts,
): Promise<void> {
  const decision = reconcilePoll({
    kind: "project",
    vaStatus: existing.status,
    notionOption: statusName,
    lastNotionStatus: existing.notionStatus,
    statusMap: mapOf(conn),
  });
  if (decision.action === "applyToVa") {
    await db.project.update({
      where: { id: existing.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: decision.vaStatus as any, notionStatus: decision.notionOption, notionSyncedAt: new Date() },
    });
    counts.updated++;
  } else if (decision.action === "pushToNotion") {
    const { name, type } = statusPropFor(conn, "project");
    const p = await db.project.findUniqueOrThrow({ where: { id: existing.id }, select: { notionPageId: true } });
    if (p.notionPageId) {
      await notionPatch(p.notionPageId, statusPropertyPayload(name, type, decision.notionOption), cfg(conn));
      await db.project.update({ where: { id: existing.id }, data: { notionStatus: decision.notionOption, notionSyncedAt: new Date() } });
      counts.pushed++;
    }
  } else if (statusName && statusName !== existing.notionStatus) {
    // Notion text changed but maps to nothing/same — advance the guard so we don't re-evaluate forever.
    await db.project.update({ where: { id: existing.id }, data: { notionStatus: statusName } });
  }
}

async function applyTaskReconcile(
  conn: NotionConnection,
  existing: { id: string; status: string; notionStatus: string | null },
  statusName: string | null,
  counts: SyncCounts,
): Promise<void> {
  const decision = reconcilePoll({
    kind: "task",
    vaStatus: existing.status,
    notionOption: statusName,
    lastNotionStatus: existing.notionStatus,
    statusMap: mapOf(conn),
  });
  if (decision.action === "applyToVa") {
    await db.task.update({
      where: { id: existing.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: decision.vaStatus as any, notionStatus: decision.notionOption, notionSyncedAt: new Date() },
    });
    counts.updated++;
  } else if (decision.action === "pushToNotion") {
    const { name, type } = statusPropFor(conn, "task");
    const t = await db.task.findUniqueOrThrow({ where: { id: existing.id }, select: { notionPageId: true } });
    if (t.notionPageId) {
      await notionPatch(t.notionPageId, statusPropertyPayload(name, type, decision.notionOption), cfg(conn));
      await db.task.update({ where: { id: existing.id }, data: { notionStatus: decision.notionOption, notionSyncedAt: new Date() } });
      counts.pushed++;
    }
  } else if (statusName && statusName !== existing.notionStatus) {
    await db.task.update({ where: { id: existing.id }, data: { notionStatus: statusName } });
  }
}

async function importProject(
  conn: NotionConnection,
  page: Record<string, unknown>,
  pageId: string,
  url: string,
  statusName: string | null,
  clientName: string | null,
  ownerId: string | null,
  counts: SyncCounts,
): Promise<void> {
  if (!ownerId) {
    counts.skipped++;
    return;
  }
  const title = notionPageTitleText(page) || "Untitled (Notion)";
  const vaStatus = (statusName && notionOptionToVaStatus("project", statusName, mapOf(conn))) || "Planning";
  await db.project.create({
    data: {
      name: title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: vaStatus as any,
      description: ensureNotionLink(null, url),
      client: clientName ?? undefined,
      ownerId,
      createdById: ownerId,
      clientOrganizationId: conn.clientOrganizationId,
      notionPageId: pageId,
      notionUrl: url,
      notionStatus: statusName,
      notionSyncedAt: new Date(),
    },
  });
  counts.imported++;
}

async function importTask(
  conn: NotionConnection,
  page: Record<string, unknown>,
  pageId: string,
  url: string,
  statusName: string | null,
  clientName: string | null,
  ownerId: string | null,
  counts: SyncCounts,
): Promise<void> {
  if (!ownerId) {
    counts.skipped++;
    return;
  }
  const title = notionPageTitleText(page) || "Untitled (Notion)";
  const vaStatus = (statusName && notionOptionToVaStatus("task", statusName, mapOf(conn))) || "NotStarted";
  await db.task.create({
    data: {
      title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: vaStatus as any,
      instructions: ensureNotionLink(null, url),
      client: clientName ?? undefined,
      assignedToId: ownerId,
      assignedById: ownerId,
      claimable: true, // imported tasks land in the Available pool until a VA claims them
      clientOrganizationId: conn.clientOrganizationId,
      notionPageId: pageId,
      notionUrl: url,
      notionStatus: statusName,
      notionSyncedAt: new Date(),
    },
  });
  counts.imported++;
}
