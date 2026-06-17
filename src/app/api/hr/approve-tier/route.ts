import { action, optStr, str } from "@/lib/api";
import { approveTierReview, normalizeCompRole } from "@/lib/actions/hr";

export const POST = action(
  async ({ user, body }) => {
    return approveTierReview(
      requiredString(body, "reviewId", "review_id"),
      requiredString(body, "vaId", "va_id"),
      normalizeCompRole(requiredString(body, "targetRole", "target_role"), "targetRole"),
      user.email,
    );
  },
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);

function requiredString(body: Record<string, unknown>, primary: string, fallback: string): string {
  if (optStr(body, primary) !== undefined) return str(body, primary).trim();
  if (optStr(body, fallback) !== undefined) return str(body, fallback).trim();
  return str(body, primary).trim();
}
