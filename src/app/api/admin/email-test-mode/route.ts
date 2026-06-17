import { action, optStr } from "@/lib/api";
import { setEmailTestRedirect } from "@/lib/actions/hr";

// Admin only (allow: () => false → only isAdmin passes). Pass { email } to turn
// on (redirect target) or { email: "" } / omit to turn off.
export const POST = action(
  async ({ user, body }) => setEmailTestRedirect(optStr(body, "email"), user.email),
  { allow: () => false },
);
