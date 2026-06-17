import { action } from "@/lib/api";
import { markPeriodPaid } from "@/lib/actions/payroll";

export const POST = action(
  ({ body }) => markPeriodPaid(body.periodStart),
  { allow: (r) => r === "BOOKKEEPER" || r === "HR_MANAGER" },
);
