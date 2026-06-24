import { action } from "@/lib/api";
import { getEffectiveVaId } from "@/lib/auth/access";
import { setNotifyPrefs } from "@/lib/actions/va";

export const POST = action(
  async ({ user, body }) => setNotifyPrefs(await getEffectiveVaId(user), body.notifyTasks),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
