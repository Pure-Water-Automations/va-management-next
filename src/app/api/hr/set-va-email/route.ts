import { action, str } from "@/lib/api";
import { setVaEmail } from "@/lib/actions/hr";

export const POST = action(
  async ({ user, body }) => setVaEmail(str(body, "vaId"), str(body, "email"), user.email),
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);
