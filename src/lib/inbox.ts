import { db } from "@/lib/db";

/**
 * Persistent in-console notification inbox (the `Notification` table) — distinct
 * from the computed Purii pending-action badges in `notifications.ts`. Powers the
 * header bell: supervisor "task added" pings and @mention pings.
 */

export async function createNotification(
  userId: string | null | undefined,
  type: string,
  body: string,
  link?: string | null,
): Promise<void> {
  if (!userId) return;
  try {
    await db.notification.create({ data: { userId, type, body, link: link ?? null } });
  } catch {
    // best-effort — never break the underlying action
  }
}

export async function getNotifications(userId: string, limit = 25) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, read: false } });
}

export async function markNotificationRead(userId: string, id: string) {
  await db.notification.updateMany({ where: { id, userId }, data: { read: true } });
  return { ok: true };
}

export async function markAllNotificationsRead(userId: string) {
  await db.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  return { ok: true };
}

/** Resolve the User-login id of a VA's supervisor (via Va.supervisorVaId). */
export async function supervisorUserId(actorId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: actorId }, include: { va: true } });
  const supVaId = u?.va?.supervisorVaId;
  if (!supVaId) return null;
  const sup = await db.user.findFirst({ where: { vaId: supVaId, active: true }, select: { id: true } });
  return sup?.id ?? null;
}

/** Best-effort: resolve @mention tokens in a comment body to active User ids. */
export async function notifyMentions(body: string, link: string, authorName: string): Promise<void> {
  const tokens = Array.from(body.matchAll(/@([\p{L}][\p{L}.\-]{1,30})/gu)).map((m) => m[1]);
  if (tokens.length === 0) return;
  const seen = new Set<string>();
  for (const token of tokens) {
    const clean = token.replace(/[.\-]/g, " ").trim();
    if (clean.length < 2) continue;
    const users = await db.user.findMany({
      where: { active: true, name: { contains: clean, mode: "insensitive" } },
      select: { id: true },
      take: 3,
    });
    for (const u of users) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      await createNotification(u.id, "mention", `${authorName} mentioned you in a comment`, link);
    }
  }
}
