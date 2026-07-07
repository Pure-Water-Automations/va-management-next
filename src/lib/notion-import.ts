// Notion → OS Hub page importer (Sprint 1, Phase 4.6).
//
// Pure half: convertNotionBlocks() maps Notion's block JSON onto the hub's
// Block[] shape (unit-tested in tests/notion-import.test.ts). Impure half:
// importNotionPage() fetches via the existing lib/notion.ts client and upserts
// a Page — idempotent on notionPageId, so re-importing updates in place and
// never duplicates. Child pages import recursively (depth-capped).

import { db } from "@/lib/db";
import { notionGet, notionNormalizeId, notionRetrievePage, notionPageTitleText, type NotionConfig } from "@/lib/notion";
import type { Block } from "@/lib/services/blocks";
import type { PageScope } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

/** Join a Notion rich_text array to plain text. */
export function richTextToPlain(rich: unknown): string {
  if (!Array.isArray(rich)) return "";
  return rich
    .map((r) => (typeof r === "object" && r !== null ? String((r as JsonRecord).plain_text ?? "") : ""))
    .join("");
}

export type ConvertedChild = { notionPageId: string; title: string };

/**
 * Convert Notion blocks → hub blocks. Returns the converted blocks plus any
 * child_page references found (imported separately as sub-pages). Unsupported
 * kinds degrade to a paragraph note rather than silently vanishing.
 */
export function convertNotionBlocks(notionBlocks: unknown[]): {
  blocks: Block[];
  children: ConvertedChild[];
} {
  const blocks: Block[] = [];
  const children: ConvertedChild[] = [];
  let i = 0;
  const id = () => `n${i++}`;

  for (const raw of notionBlocks) {
    if (typeof raw !== "object" || raw === null) continue;
    const b = raw as JsonRecord;
    const type = String(b.type ?? "");
    const payload = (b[type] ?? {}) as JsonRecord;
    const text = richTextToPlain(payload.rich_text);

    switch (type) {
      case "heading_1":
      case "heading_2":
      case "heading_3":
        if (text) blocks.push({ id: id(), kind: "h2", text });
        break;
      case "paragraph":
        if (text) blocks.push({ id: id(), kind: "p", text });
        break;
      case "to_do":
        blocks.push({ id: id(), kind: "todo", text, done: payload.checked === true });
        break;
      case "bulleted_list_item":
        blocks.push({ id: id(), kind: "ul", text });
        break;
      case "numbered_list_item":
        blocks.push({ id: id(), kind: "ol", text });
        break;
      case "code":
        blocks.push({ id: id(), kind: "code", text });
        break;
      case "callout":
      case "quote":
        blocks.push({ id: id(), kind: "callout", text });
        break;
      case "toggle":
        // Toggles flatten to a paragraph (their children aren't fetched here).
        if (text) blocks.push({ id: id(), kind: "p", text });
        break;
      case "divider":
        break; // no divider kind — drop silently
      case "child_page": {
        const title = String((payload as JsonRecord).title ?? "Untitled");
        const pageId = String(b.id ?? "");
        if (pageId) children.push({ notionPageId: pageId, title });
        break;
      }
      default:
        blocks.push({ id: id(), kind: "p", text: text || `[not imported: ${type}]` });
    }
  }

  return { blocks, children };
}

/** All block children of a Notion block/page, following pagination. */
export async function fetchAllBlockChildren(pageId: string, cfg: NotionConfig): Promise<unknown[]> {
  const out: unknown[] = [];
  let cursor: string | null = null;
  do {
    const qs: string = `page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = (await notionGet(`/blocks/${pageId}/children?${qs}`, cfg)) as JsonRecord;
    out.push(...((res.results as unknown[]) ?? []));
    cursor = res.has_more ? String(res.next_cursor ?? "") || null : null;
  } while (cursor);
  return out;
}

/** Token resolution: env override first, else the newest active org connection. */
export async function resolveNotionToken(): Promise<string | null> {
  const envToken = process.env.NOTION_TOKEN?.trim();
  if (envToken) return envToken;
  const conn = await db.notionConnection.findFirst({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    select: { token: true },
  });
  return conn?.token ?? null;
}

export type ImportResult = { pageId: string; title: string; children: ImportResult[] };

const MAX_DEPTH = 3;

/** Import one Notion page (and its child pages) into the hub. Idempotent. */
export async function importNotionPage(
  actorId: string,
  notionPageIdOrUrl: string,
  target: { scope: PageScope; projectId: string | null; parentId: string | null },
  cfg: NotionConfig,
  depth = 0,
): Promise<ImportResult> {
  const notionPageId = notionNormalizeId(notionPageIdOrUrl);

  const page = await notionRetrievePage(notionPageId, cfg);
  const title = notionPageTitleText(page) || "Untitled import";
  const rawBlocks = await fetchAllBlockChildren(notionPageId, cfg);
  const { blocks, children } = convertNotionBlocks(rawBlocks);

  const existing = await db.page.findUnique({ where: { notionPageId }, select: { id: true } });
  const saved = existing
    ? await db.page.update({
        where: { id: existing.id },
        data: { title, blocks: blocks as object[], version: { increment: 1 }, updatedById: actorId },
        select: { id: true },
      })
    : await db.page.create({
        data: {
          scope: target.scope,
          projectId: target.projectId,
          parentId: target.parentId,
          title,
          order: await db.page.count({
            where: { scope: target.scope, projectId: target.projectId, parentId: target.parentId },
          }),
          blocks: blocks as object[],
          notionPageId,
          createdById: actorId,
        },
        select: { id: true },
      });

  const childResults: ImportResult[] = [];
  if (depth < MAX_DEPTH) {
    for (const child of children) {
      childResults.push(
        await importNotionPage(
          actorId,
          child.notionPageId,
          { scope: target.scope, projectId: target.projectId, parentId: saved.id },
          cfg,
          depth + 1,
        ),
      );
    }
  }

  return { pageId: saved.id, title, children: childResults };
}
