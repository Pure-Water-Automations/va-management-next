import { action, str } from "@/lib/api";
import { addTaskComment } from "@/lib/actions/comments";

// The action wrapper handles identity + JSON parse + audit; addTaskComment
// enforces per-task permission internally, so any authenticated role may call.
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(async ({ user, body }) => {
    const { id } = await params;
    return addTaskComment(user.id, user.role, id, str(body, "body"));
  })(request);
}
