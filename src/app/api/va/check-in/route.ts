import { action } from "@/lib/api";
import { submitCheckIn } from "@/lib/actions/va";

export const POST = action(
  ({ user, body }) =>
    submitCheckIn(user.va?.vaId, {
      targetHoursWeekly: body.targetHoursWeekly,
      availabilityNotes: body.availabilityNotes,
      capacityFlag: body.capacityFlag,
      notes: body.notes,
    }),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
