import { action, str } from "@/lib/api";
import { canManageProjects } from "@/lib/auth/roles";
import { addProjectComment } from "@/lib/actions/comments";

// projectId is also present in the dynamic [id] segment, but the action() wrapper
// only passes { user, body }, so the client sends projectId in the JSON body too.
export const POST = action(
  async ({ user, body }) =>
    addProjectComment(user.id, user.role, str(body, "projectId"), str(body, "body")),
  { allow: (r) => canManageProjects(r) },
);
