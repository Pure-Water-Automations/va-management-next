import { action } from "@/lib/api";
import { createPeriod } from "@/lib/actions/payroll";

export const POST = action(
  ({ body }) =>
    createPeriod({
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      closeDate: body.closeDate,
      status: body.status,
    }),
  { allow: (r) => r === "BOOKKEEPER" || r === "HR_MANAGER" },
);
