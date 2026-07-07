import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, canManageTasks } from "@/lib/auth/roles";
import type { Role } from "@prisma/client";

const ENTITY_TYPES = new Set(["project", "page", "task", "recording", "clientOrg"]);

export async function createLink(
  actorId: string,
  actorRole: Role,
  input: { fromType: string; fromId: string; toType: string; toId: string; label: string },
) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to link items");
  if (!ENTITY_TYPES.has(input.fromType) || !ENTITY_TYPES.has(input.toType))
    throw new Error("Unknown entity type");
  if (input.fromType === input.toType && input.fromId === input.toId)
    throw new Error("Can't link an item to itself");

  const link = await db.link.upsert({
    where: {
      fromType_fromId_toType_toId: {
        fromType: input.fromType,
        fromId: input.fromId,
        toType: input.toType,
        toId: input.toId,
      },
    },
    create: { ...input, label: input.label.slice(0, 200), createdBy: actorId },
    update: { label: input.label.slice(0, 200) },
  });

  await logActivity({
    source: "link_action",
    eventType: "link_created",
    severity: "info",
    summary: `Linked ${input.toType} "${input.label}" — backlink added on the other side.`,
  });

  return link;
}

export async function deleteLink(actorId: string, actorRole: Role, linkId: string) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to unlink items");
  await db.link.delete({ where: { id: linkId } });
  return { id: linkId };
}
