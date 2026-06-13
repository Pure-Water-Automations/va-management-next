import { action } from "@/lib/api";
import { requestTargetHours } from "@/lib/actions/va";

export const POST = action(
  ({ user, body }) => requestTargetHours(user.va?.vaId, body.newTarget, body.notes),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
