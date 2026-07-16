import { action } from "@/lib/api";
import { getEffectiveVaId } from "@/lib/auth/access";
import { submitCheckIn } from "@/lib/actions/va";

export const POST = action(
  async ({ user, body }) =>
    submitCheckIn(await getEffectiveVaId(user), {
      targetHoursWeekly: body.targetHoursWeekly,
      availabilityNotes: body.availabilityNotes,
      availabilityStartHourEst: body.availabilityStartHourEst,
      availabilityEndHourEst: body.availabilityEndHourEst,
      capacityFlag: body.capacityFlag,
      notes: body.notes,
    }),
  { allow: (r) => r === "VA" },
);
