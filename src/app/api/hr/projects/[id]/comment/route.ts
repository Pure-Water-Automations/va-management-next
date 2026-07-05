import { action, str } from "@/lib/api";
import { addProjectComment } from "@/lib/actions/comments";

// projectId is also present in the dynamic [id] segment, but the action() wrapper
// only passes { user, body }, so the client sends projectId in the JSON body too.
// Guard matches the addProjectComment action (delegation authority) so a delegating
// (senior-tier) VA — who per spec can comment on projects — isn't blocked here.
export const POST = action(
  async ({ user, body }) =>
    addProjectComment(
      user.id,
      user.role,
      str(body, "projectId"),
      str(body, "body"),
      typeof body.visibility === "string" ? body.visibility : undefined,
    ),
  { allowUser: (u) => u.caps.manageTasks },
);
