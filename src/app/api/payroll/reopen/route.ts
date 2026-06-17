import { action } from "@/lib/api";
import { reopenPeriod } from "@/lib/actions/payroll";

export const POST = action(
  ({ body }) => reopenPeriod(body.periodStart),
  { allow: (r) => r === "BOOKKEEPER" || r === "HR_MANAGER" },
);
