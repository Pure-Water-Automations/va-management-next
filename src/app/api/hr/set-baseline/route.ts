import { action, optNum, str } from "@/lib/api";
import { setVaBaseline } from "@/lib/actions/hr";

export const POST = action(
  async ({ user, body }) => setVaBaseline(str(body, "vaId"), optNum(body, "baselineHours") ?? 0, user.email),
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);
