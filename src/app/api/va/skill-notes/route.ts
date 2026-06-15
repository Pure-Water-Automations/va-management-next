import { action } from "@/lib/api";
import { getEffectiveVaId } from "@/lib/auth/access";
import { saveSkillNotes } from "@/lib/actions/va";

export const POST = action(
  async ({ user, body }) => saveSkillNotes(await getEffectiveVaId(user), body.skills),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
