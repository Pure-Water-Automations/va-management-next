/**
 * VA self-profile update: bio, location, timezone, birthday (month+day — no year,
 * for privacy). Any signed-in user with a linked VA record (or an admin in
 * "view as VA" mode) edits the effective VA's profile.
 */
import { action, optNum, optStr } from "@/lib/api";
import { getEffectiveVaId } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { daysInMonth } from "@/lib/birthdays";

export const POST = action(async ({ user, body }) => {
  const vaId = await getEffectiveVaId(user);
  if (!vaId) throw new Error("Your login isn't linked to a VA record.");

  const month = optNum(body, "birthdayMonth");
  const day = optNum(body, "birthdayDay");
  // Birthday is set/cleared as a pair.
  if ((month === undefined) !== (day === undefined)) {
    throw new Error("Pick both a birthday month and day (or neither).");
  }
  if (month !== undefined && day !== undefined) {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Invalid birthday month.");
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth(month)) throw new Error("Invalid birthday day.");
  }

  const bio = optStr(body, "bio");
  const location = optStr(body, "location");
  const timezone = optStr(body, "timezone");
  if (bio && bio.length > 1000) throw new Error("Bio is too long (max 1000 characters).");

  await db.va.update({
    where: { vaId },
    data: {
      bio: bio ?? null,
      location: location ?? null,
      timezone: timezone ?? null,
      birthdayMonth: month ?? null,
      birthdayDay: day ?? null,
    },
  });
  return { vaId };
});
