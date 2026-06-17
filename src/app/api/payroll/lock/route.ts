import { action } from "@/lib/api";
import { lockOpenPeriod } from "@/lib/actions/payroll";

export const POST = action(
  () => lockOpenPeriod(),
  { allow: (r) => r === "BOOKKEEPER" || r === "HR_MANAGER" },
);
