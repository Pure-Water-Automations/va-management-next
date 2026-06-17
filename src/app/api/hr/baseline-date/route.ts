import { action, optStr } from "@/lib/api";
import { setBaselineCutover } from "@/lib/actions/hr";

export const POST = action(
  async ({ user, body }) => setBaselineCutover(optStr(body, "date"), user.email),
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);
