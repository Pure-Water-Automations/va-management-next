import { action } from "@/lib/api";
import { getEffectiveVaId } from "@/lib/auth/access";
import { flagCapacity } from "@/lib/actions/va";

export const POST = action(
  async ({ user, body }) => flagCapacity(await getEffectiveVaId(user), body.flag, body.notes),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
