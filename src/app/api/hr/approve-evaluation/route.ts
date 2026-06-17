import { action, optStr, str } from "@/lib/api";
import { approveEvaluation } from "@/lib/actions/evaluation";
import { normalizeCompRole } from "@/lib/actions/hr";

export const POST = action(
  async ({ user, body }) => {
    const targetRoleRaw = optStr(body, "targetRole");
    return approveEvaluation(
      str(body, "evaluationId"),
      {
        targetRole: targetRoleRaw ? normalizeCompRole(targetRoleRaw, "targetRole") : undefined,
        hrNotes: optStr(body, "hrNotes"),
      },
      user.email,
    );
  },
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);
