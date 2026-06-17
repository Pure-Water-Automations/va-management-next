import { action, optStr, optNum, str } from "@/lib/api";
import { saveTrainingTask } from "@/lib/actions/training-tasks";
import { canDecideHire } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    saveTrainingTask(
      {
        id: optStr(body, "id"),
        kind: optStr(body, "kind"),
        task: str(body, "task"),
        skill: optStr(body, "skill"),
        estMinutes: optNum(body, "estMinutes"),
        instructions: optStr(body, "instructions"),
        instructionsLink: optStr(body, "instructionsLink"),
        sortOrder: optNum(body, "sortOrder"),
        active: typeof body.active === "boolean" ? body.active : undefined,
      },
      user.email,
    ),
  { allow: canDecideHire },
);
