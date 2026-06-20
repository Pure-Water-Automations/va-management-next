import { getCurrentUser } from "@/lib/auth/access";
import { canReviewMeetingActions } from "@/lib/auth/roles";
import { runWithActor } from "@/lib/request-context";
import { confirmMeetingActionItem } from "@/lib/actions/meeting-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user.isAdmin && !canReviewMeetingActions(user.role)) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }
  await params; // [id] = meetingActionId; the item carries its own parent link

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
      confirmMeetingActionItem(user, { itemId: body.itemId!, assigneeId: body.assigneeId!, dueDate: body.dueDate }),
    );
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
