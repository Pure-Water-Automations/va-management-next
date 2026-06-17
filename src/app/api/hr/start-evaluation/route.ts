import { action, optStr, str } from "@/lib/api";
import { startEvaluation } from "@/lib/actions/evaluation";

export const POST = action(
  async ({ user, body }) => {
    return startEvaluation(str(body, "vaId"), { stage: optStr(body, "stage") }, user.email);
  },
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);
