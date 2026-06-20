import { action, str, optStr } from "@/lib/api";
import { setOnboardingFlag, markClientOnboardingComplete, sendIntakeForm } from "@/lib/actions/client-onboarding";

const allow = (role: string) => role === "HR_MANAGER" || role === "PEOPLE_OPS";

// Internal client-onboarding actions, dispatched on `op`. Admins bypass.
export const POST = action(
  async ({ body }) => {
    const op = str(body, "op");
    switch (op) {
      case "set_flag":
        return setOnboardingFlag(str(body, "orgId"), str(body, "field"), body.value, optStr(body, "note"));
      case "complete":
        return markClientOnboardingComplete(str(body, "orgId"));
      case "send_intake":
        return sendIntakeForm(str(body, "orgId"));
      default:
        throw new Error(`Unknown op: ${op}`);
    }
  },
  { allow },
);
