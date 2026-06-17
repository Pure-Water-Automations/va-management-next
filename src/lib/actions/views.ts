import { db } from "@/lib/db";
import { canManageTasks, AuthorizationError } from "@/lib/auth/roles";
import type { Role } from "@prisma/client";

/** Save the current task/project filter+sort+group querystring as a named view. */
export async function createSavedView(
  actorId: string,
  actorRole: Role,
  input: { name: unknown; scope?: unknown; query?: unknown },
) {
  if (!canManageTasks(actorRole)) throw new AuthorizationError("Not allowed to save views");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("View name is required");
  const scope = typeof input.scope === "string" && input.scope ? input.scope : "tasks";
  const query = typeof input.query === "string" ? input.query.replace(/^\?/, "") : "";
  return db.savedView.create({
    data: { userId: actorId, name, scope, query },
    select: { id: true, name: true, query: true },
  });
}

/** Delete a saved view — owner only. */
export async function deleteSavedView(actorId: string, _actorRole: Role, id: string) {
  const view = await db.savedView.findUnique({ where: { id }, select: { userId: true } });
  if (!view) return { ok: true };
  if (view.userId !== actorId) throw new AuthorizationError("You can only delete your own views");
  await db.savedView.delete({ where: { id } });
  return { ok: true };
}
