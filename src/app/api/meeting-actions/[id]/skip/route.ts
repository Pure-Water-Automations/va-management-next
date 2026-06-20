import { getCurrentUser } from "@/lib/auth/access";
import { canReviewMeetingActions } from "@/lib/auth/roles";
import { runWithActor } from "@/lib/request-context";
import { skipMeetingActionItems } from "@/lib/actions/meeting-actions";

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
  const { id } = await params;

  let body: { itemId?: string; all?: boolean };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await runWithActor(user.email, () =>
      skipMeetingActionItems(user, { meetingActionId: id, itemId: body.itemId, all: body.all }),
    );
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
