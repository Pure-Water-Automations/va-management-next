import { action, str, optStr } from "@/lib/api";
import { isFounder } from "@/lib/auth/access";
import { AuthorizationError } from "@/lib/auth/roles";
import { importNotionPage, resolveNotionToken } from "@/lib/notion-import";
import { logActivity } from "@/lib/activity";

/**
 * Founder-gated Notion → hub importer. Read-only against Notion; idempotent
 * on the source page id (re-import updates, never duplicates).
 */
export const POST = action(async ({ user, body }) => {
  if (!isFounder(user.email)) throw new AuthorizationError("Importer is founder-only for now");

  const token = await resolveNotionToken();
  if (!token)
    throw new Error(
      "No Notion token available — set NOTION_TOKEN in the box env or connect Notion for an org",
    );

  const projectId = optStr(body, "projectId") ?? null;
  const result = await importNotionPage(
    user.id,
    str(body, "notionPage"),
    { scope: projectId ? "PROJECT" : "LIBRARY", projectId, parentId: null },
    { token },
  );

  const count = 1 + result.children.length;
  await logActivity({
    source: "page_action",
    eventType: "notion_imported",
    severity: "success",
    summary: `Imported "${result.title}" (+${result.children.length} sub-pages) from Notion.`,
  });

  return { ...result, count };
});
