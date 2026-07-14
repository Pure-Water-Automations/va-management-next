import { action, str } from "@/lib/api";
import { addProjectComment } from "@/lib/actions/comments";

// projectId is also present in the dynamic [id] segment, but the action() wrapper
// only passes { actor, body }, so the client sends projectId in the JSON body too.
// Guard matches the addProjectComment action's manageTasks capability so a
// delegating (senior-tier) VA — who per spec can comment on projects — isn't blocked here.
export const POST = action(
  async ({ actor, body }) =>
    addProjectComment(
      actor.id,
      actor.role,
      str(body, "projectId"),
      str(body, "body"),
      typeof body.visibility === "string" ? body.visibility : undefined,
    ),
  { allowUser: (u) => u.caps.manageTasks },
);
