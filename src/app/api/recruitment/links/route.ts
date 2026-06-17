import { action, optStr } from "@/lib/api";
import { setRecruitmentLinks } from "@/lib/actions/recruitment";
import { canDecideHire } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    setRecruitmentLinks(optStr(body, "bookingUrl"), optStr(body, "videoUrl"), user.email),
  { allow: canDecideHire },
);
