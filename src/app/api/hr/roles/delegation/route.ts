import { action, str } from "@/lib/api";
import { normalizeCompRole, setRoleDelegation } from "@/lib/actions/hr";

function optBool(body: Record<string, unknown>, key: string): boolean | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const n = v.trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(n)) return true;
    if (["false", "no", "0", "off"].includes(n)) return false;
  }
  throw new Error(`Invalid boolean field: ${key}`);
}

export const POST = action(
  async ({ user, body }) => {
    return setRoleDelegation(user.email, {
      roleId: normalizeCompRole(str(body, "roleId"), "roleId"),
      canDelegateTasks: optBool(body, "canDelegateTasks"),
      canDelegateProjects: optBool(body, "canDelegateProjects"),
      canReviewMeetingActions: optBool(body, "canReviewMeetingActions"),
    });
  },
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);
