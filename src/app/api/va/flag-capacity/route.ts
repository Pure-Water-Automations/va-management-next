import { action } from "@/lib/api";
import { flagCapacity } from "@/lib/actions/va";

export const POST = action(
  ({ user, body }) => flagCapacity(user.va?.vaId, body.flag, body.notes),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
