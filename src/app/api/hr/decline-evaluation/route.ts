import { action, optStr, str } from "@/lib/api";
import { declineEvaluation } from "@/lib/actions/evaluation";

export const POST = action(
  async ({ user, body }) => {
    return declineEvaluation(str(body, "evaluationId"), { hrNotes: optStr(body, "hrNotes") }, user.email);
  },
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);
