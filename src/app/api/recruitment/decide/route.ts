import { decide } from "@/lib/actions/recruitment";
import { action, optStr, str } from "@/lib/api";
import { canDecideHire } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    decide(str(body, "candidateId"), str(body, "decision"), optStr(body, "note"), user.email),
  { allow: canDecideHire },
);
