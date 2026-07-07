import { action, str } from "@/lib/api";
import { canManageTasks } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { openrouterChat } from "@/lib/matrix/openrouter";
import { buildScratchExtractionMessages } from "@/lib/scratch/extract";
import { parseExtractedItems } from "@/lib/meetings/extract";

/**
 * Purii "extract action items" (OS Hub Phase 3). Proposals are RETURNED, not
 * persisted — the client confirms each one (→ /api/hr/scratch/promote or
 * /api/hr/tasks) or skips it. Same confirm-first doctrine as Meeting Actions.
 */
export const POST = action(
  async ({ body }) => {
    const projectId = str(body, "projectId");
    const [project, items] = await Promise.all([
      db.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } }),
      db.scratchItem.findMany({
        where: { projectId, promotedTaskId: null },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, text: true },
      }),
    ]);
    if (items.length === 0) return { proposals: [] };

    const res = await openrouterChat({
      messages: buildScratchExtractionMessages(
        project.name,
        items.map((i) => i.text),
      ),
      temperature: 0.2,
      max_tokens: 900,
    });
    const proposals = parseExtractedItems(res.choices?.[0]?.message?.content ?? "");
    if (proposals === null) throw new Error("Purii returned unparseable output — try again");

    // Best-effort back-reference: match each proposal to the bullet it came from
    // so confirming can promote the original item (keeps the client-request loop).
    const withSource = proposals.map((p) => {
      const match = items.find(
        (i) =>
          i.text.toLowerCase().includes(p.title.toLowerCase()) ||
          p.title.toLowerCase().includes(i.text.toLowerCase().slice(0, 40)),
      );
      return { title: p.title, description: p.description ?? null, scratchItemId: match?.id ?? null };
    });

    return { proposals: withSource };
  },
  { allow: canManageTasks },
);
