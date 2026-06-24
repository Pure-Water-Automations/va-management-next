import { action, str } from "@/lib/api";
import { matrixAct } from "@/lib/matrix/agent";

// Matrix mode — admin only (allow:()=>false + the wrapper's admin bypass).
export const POST = action(
  async ({ actor, body }) => matrixAct(str(body, "question"), actor.role, actor.email),
  { allow: () => false },
);
