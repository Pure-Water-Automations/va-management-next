import { action } from "@/lib/api";
import { saveSkillNotes } from "@/lib/actions/va";

export const POST = action(
  ({ user, body }) => saveSkillNotes(user.va?.vaId, body.skills),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
