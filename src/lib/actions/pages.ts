import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, canManageTasks, canManageProjects } from "@/lib/auth/roles";
import { sanitizeBlocks, type Block } from "@/lib/services/blocks";
import type { PageScope, Role } from "@prisma/client";

export type CreatePageInput = {
  scope: PageScope;
  projectId?: string;
  parentId?: string;
  title: string;
};

export async function createPage(actorId: string, actorRole: Role, input: CreatePageInput) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to create pages");

  const title = input.title.trim();
  if (!title) throw new Error("Page title is required");
  const projectId = input.projectId?.trim() || null;
  if (input.scope === "PROJECT" && !projectId) throw new Error("Project pages need a projectId");
  if (input.scope === "LIBRARY" && projectId) throw new Error("Library pages don't take a projectId");
  if (projectId) {
    await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } });
  }
  const parentId = input.parentId?.trim() || null;
  if (parentId) {
    const parent = await db.page.findUniqueOrThrow({
      where: { id: parentId },
      select: { scope: true, projectId: true },
    });
    if (parent.scope !== input.scope || parent.projectId !== projectId)
      throw new Error("Parent page belongs to a different tree");
  }

  const order = await db.page.count({ where: { scope: input.scope, projectId, parentId } });

  const page = await db.page.create({
    data: { scope: input.scope, projectId, parentId, title, order, createdById: actorId },
    select: { id: true, title: true },
  });

  await logActivity({
    source: "page_action",
    eventType: "page_created",
    severity: "success",
    summary: `Page "${page.title}" created${projectId ? " in project hub" : " in Library"}.`,
  });

  return page;
}

/**
 * Save a page's blocks with optimistic concurrency: the client sends the
 * version it loaded; a mismatch means someone else saved in between and the
 * caller should reload rather than silently clobber their edit.
 */
export async function savePageBlocks(
  actorId: string,
  actorRole: Role,
  pageId: string,
  blocksInput: unknown,
  version: number,
) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to edit pages");

  const blocks: Block[] = sanitizeBlocks(blocksInput);

  const res = await db.page.updateMany({
    where: { id: pageId, version },
    data: {
      blocks: blocks as object[],
      version: { increment: 1 },
      updatedById: actorId,
    },
  });
  if (res.count === 0) {
    await db.page.findUniqueOrThrow({ where: { id: pageId }, select: { id: true } });
    throw new Error("This page changed since you loaded it — reload to get the latest version");
  }

  return { pageId, version: version + 1 };
}

export async function renamePage(actorId: string, actorRole: Role, pageId: string, title: string) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to edit pages");
  const t = title.trim();
  if (!t) throw new Error("Page title is required");
  const page = await db.page.update({
    where: { id: pageId },
    data: { title: t, updatedById: actorId },
    select: { id: true, title: true },
  });
  return page;
}

/** Toggle client-portal sharing: `published` (Library) / `clientVisible` (project Overview). */
export async function setPageSharing(
  actorId: string,
  actorRole: Role,
  pageId: string,
  input: { published?: boolean; clientVisible?: boolean },
) {
  if (!canManageProjects(actorRole))
    throw new AuthorizationError("You don't have permission to change page sharing");
  const page = await db.page.update({
    where: { id: pageId },
    data: {
      ...(input.published !== undefined ? { published: input.published } : {}),
      ...(input.clientVisible !== undefined ? { clientVisible: input.clientVisible } : {}),
      updatedById: actorId,
    },
    select: { id: true, title: true, published: true, clientVisible: true },
  });
  await logActivity({
    source: "page_action",
    eventType: "page_sharing_changed",
    severity: "info",
    summary: `Page "${page.title}" sharing: published=${page.published}, clientVisible=${page.clientVisible}.`,
  });
  return page;
}

export async function deletePage(actorId: string, actorRole: Role, pageId: string) {
  if (!canManageProjects(actorRole))
    throw new AuthorizationError("You don't have permission to delete pages");
  const kids = await db.page.count({ where: { parentId: pageId } });
  if (kids > 0) throw new Error("Delete or move this page's sub-pages first");
  const page = await db.page.delete({ where: { id: pageId }, select: { id: true, title: true } });
  await logActivity({
    source: "page_action",
    eventType: "page_deleted",
    severity: "warning",
    summary: `Page "${page.title}" deleted.`,
  });
  return { id: page.id };
}

/**
 * Idempotent bootstrap: every project hub opens with an Overview page. The
 * project description seeds the first paragraph (same behavior as the design's
 * Create Project flow).
 */
export async function ensureOverviewPage(actorId: string, projectId: string) {
  const existing = await db.page.findFirst({
    where: { projectId, scope: "PROJECT" },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (existing) return existing;

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true, description: true },
  });
  const blocks: Block[] = [
    { id: "seed-callout", kind: "callout", text: `Hub page for ${project.name}. Everything about this project lives here.` },
    ...(project.description ? [{ id: "seed-desc", kind: "p" as const, text: project.description }] : []),
  ];
  return db.page.create({
    data: {
      scope: "PROJECT",
      projectId,
      title: "Overview",
      order: 0,
      blocks: blocks as object[],
      createdById: actorId,
    },
    select: { id: true },
  });
}
