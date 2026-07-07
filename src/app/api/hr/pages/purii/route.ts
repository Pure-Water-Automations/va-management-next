import { action, str } from "@/lib/api";
import { canManageTasks } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { openrouterChat } from "@/lib/matrix/openrouter";
import { parseStoredBlocks } from "@/lib/services/blocks";
import {
  buildSummarizeMessages,
  buildChecklistMessages,
  parseChecklist,
  scoreRelated,
} from "@/lib/purii-page";

/**
 * Purii page commands (design: "Summarize this page", "Draft a checklist",
 * "Find related SOPs"). Returns PROPOSED blocks — the editor inserts them
 * into its local state and autosaves, so the page keeps a single writer and
 * the user can immediately edit or delete what Purii produced.
 */
export const POST = action(
  async ({ body }) => {
    const pageId = str(body, "pageId");
    const command = str(body, "command"); // summarize | checklist | related

    const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
    const blocks = parseStoredBlocks(page.blocks);

    if (command === "related") {
      const candidates = await db.page.findMany({
        where: { scope: "LIBRARY", id: { not: pageId } },
        select: { id: true, title: true },
        take: 100,
      });
      const related = scoreRelated(page.title, blocks, candidates);
      if (related.length === 0) return { position: "append", blocks: [], note: "No related SOPs found" };
      return {
        position: "append",
        blocks: related.map((r) => ({
          kind: "chip",
          text: `SOP: ${r.title}`,
          ref: { type: "sop", id: r.id },
        })),
      };
    }

    if (command === "summarize") {
      const res = await openrouterChat({
        messages: buildSummarizeMessages(page.title, blocks),
        temperature: 0.3,
        max_tokens: 200,
      });
      const text = (res.choices?.[0]?.message?.content ?? "").trim();
      if (!text) throw new Error("Purii came back empty — try again");
      return { position: "prepend", blocks: [{ kind: "callout", text }] };
    }

    if (command === "checklist") {
      const res = await openrouterChat({
        messages: buildChecklistMessages(page.title, blocks),
        temperature: 0.3,
        max_tokens: 400,
      });
      const items = parseChecklist(res.choices?.[0]?.message?.content ?? "");
      if (!items) throw new Error("Purii returned unparseable output — try again");
      return {
        position: "append",
        blocks: [
          { kind: "h2", text: "Checklist" },
          ...items.map((text) => ({ kind: "todo", text, done: false })),
        ],
      };
    }

    throw new Error(`Unknown command "${command}"`);
  },
  { allow: canManageTasks },
);
