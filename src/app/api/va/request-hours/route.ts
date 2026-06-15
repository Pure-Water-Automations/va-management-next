import { action } from "@/lib/api";
import { getEffectiveVaId } from "@/lib/auth/access";
import { requestTargetHours } from "@/lib/actions/va";

export const POST = action(
  async ({ user, body }) => requestTargetHours(await getEffectiveVaId(user), body.newTarget, body.notes),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
