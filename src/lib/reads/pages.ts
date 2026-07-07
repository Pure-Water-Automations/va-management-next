import { db } from "@/lib/db";
import { parseStoredBlocks, type Block } from "@/lib/services/blocks";
import type { PageScope } from "@prisma/client";

export type PageTreeNode = {
  id: string;
  title: string;
  parentId: string | null;
  depth: number;
  published: boolean;
  clientVisible: boolean;
};

export type PageDoc = {
  id: string;
  title: string;
  scope: PageScope;
  projectId: string | null;
  blocks: Block[];
  version: number;
  published: boolean;
  clientVisible: boolean;
  updatedAt: Date;
};

/** Flattened depth-first tree (parents before children), for the hub's left rail. */
export async function getPageTree(
  scope: PageScope,
  projectId: string | null,
): Promise<PageTreeNode[]> {
  const pages = await db.page.findMany({
    where: { scope, projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, parentId: true, published: true, clientVisible: true },
  });

  const byParent = new Map<string | null, typeof pages>();
  for (const p of pages) {
    const key = p.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }

  const out: PageTreeNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const p of byParent.get(parentId) ?? []) {
      out.push({ ...p, parentId: p.parentId ?? null, depth });
      if (depth < 6) walk(p.id, depth + 1); // cycle guard: cap nesting
    }
  };
  walk(null, 0);
  // Orphans (parent deleted out from under them) still show, at the root.
  for (const p of pages) {
    if (!out.some((n) => n.id === p.id)) out.push({ ...p, parentId: null, depth: 0 });
  }
  return out;
}

export async function getPageDoc(pageId: string): Promise<PageDoc | null> {
  const page = await db.page.findUnique({ where: { id: pageId } });
  if (!page) return null;
  return {
    id: page.id,
    title: page.title,
    scope: page.scope,
    projectId: page.projectId,
    blocks: parseStoredBlocks(page.blocks),
    version: page.version,
    published: page.published,
    clientVisible: page.clientVisible,
    updatedAt: page.updatedAt,
  };
}
