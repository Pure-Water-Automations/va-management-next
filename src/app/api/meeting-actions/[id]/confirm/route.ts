import { getCurrentUser, getEffectiveActor } from "@/lib/auth/access";
import { AuthorizationError } from "@/lib/auth/roles";
import { canUserReviewMeetingActions } from "@/lib/auth/delegation";
import { runWithActor } from "@/lib/request-context";
import { confirmMeetingActionItem } from "@/lib/actions/meeting-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  // Authorize + act as the effective actor (the impersonated VA when an admin is
  // viewing-as). Meeting Actions is delegation-gated, so a non-delegator can't
  // confirm and the created Task is the actor's.
  const actor = await getEffectiveActor(user);
  if (!(await canUserReviewMeetingActions(actor.id, actor.role))) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  let body: { itemId?: string; assigneeId?: string; dueDate?: string };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.itemId || !body.assigneeId) {
    return Response.json({ ok: false, error: "itemId and assigneeId required" }, { status: 400 });
  }

  try {
    const result = await runWithActor(user.email, () =>
      confirmMeetingActionItem(actor, { itemId: body.itemId!, assigneeId: body.assigneeId!, dueDate: body.dueDate }),
    );
    return Response.json({ ok: true, result });
  } catch (err) {
    const status = err instanceof AuthorizationError ? 403 : 400;
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}
