import { action } from "@/lib/api";
import { recalculateOpenPeriod } from "@/lib/actions/payroll";

export const POST = action(
  () => recalculateOpenPeriod(),
  { allow: (r) => r === "BOOKKEEPER" || r === "HR_MANAGER" },
);
