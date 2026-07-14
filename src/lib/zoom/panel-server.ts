/**
 * Server-side helpers shared by the in-meeting panel routes
 * (src/app/api/zoom/panel/**). The panel authenticates with our HMAC panel
 * token (minted from the decrypted X-Zoom-App-Context on page load), NOT the
 * console session — see src/lib/zoom/panel-auth.ts for the crypto.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { capsForUser, type CurrentUser } from "@/lib/auth/access";
import { canUserDelegateTasks } from "@/lib/auth/delegation";
import { verifyPanelToken, type PanelTokenPayload } from "@/lib/zoom/panel-auth";

/** The HMAC key for panel tokens — the Zoom client secret (already required for OAuth). */
export function panelSecret(): string | null {
  const s = env.ZOOM_CLIENT_SECRET?.trim();
  return s || null;
}

export type PanelViewer = {
  token: PanelTokenPayload;
  meetingUuid: string;
  // Mapped console user (full CurrentUser shape so existing action helpers accept
  // it) + whether createTask would accept a confirm from them. null = guest
  // (unmapped Zoom account) — guests can only vote.
  user: (CurrentUser & { canConfirm: boolean }) | null;
};

/**
 * Authenticate a panel API request: token from `?token=` (EventSource can't set
 * headers) or `Authorization: Bearer`. Returns null on any failure — callers
 * respond 401. The mapped console user is loaded fresh per request.
 */
export async function panelViewer(request: Request): Promise<PanelViewer | null> {
  const secret = panelSecret();
  if (!secret) return null;
  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const raw = url.searchParams.get("token") || bearer || "";
  const token = verifyPanelToken(raw, secret);
  if (!token) return null;

  let user: PanelViewer["user"] = null;
  if (token.userId) {
    const u = await db.user.findUnique({ where: { id: token.userId }, include: { va: true } });
    if (u && u.active) {
      const caps = await capsForUser(u);
      const canConfirm = caps.reviewMeetingActions && (await canUserDelegateTasks(u.id, u.role));
      user = { ...u, caps, canConfirm };
    }
  }
  return { token, meetingUuid: token.mid, user };
}

/** The meetingFile key the live worker writes for this meeting. */
export const meetingFileForUuid = (uuid: string) => `zoom-app://${uuid}`;

/**
 * Load an item AND verify it belongs to the token's meeting — every panel write
 * is scoped to the meeting the token was minted in.
 */
export async function itemInMeeting(itemId: string, meetingUuid: string) {
  const item = await db.meetingActionItem.findUnique({
    where: { id: itemId },
    include: { meetingAction: { select: { id: true, meetingFile: true } } },
  });
  if (!item || item.meetingAction.meetingFile !== meetingFileForUuid(meetingUuid)) return null;
  return item;
}

/** Assignable users for the reviewer's confirm dropdown (same list as /meeting-actions). */
export function assignableUsers() {
  return db.user.findMany({
    where: { active: true, role: { in: ["VA", "HR_MANAGER", "PEOPLE_OPS"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}
