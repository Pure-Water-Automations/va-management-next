/**
 * Birthday worker — celebrates each VA's birthday (month+day stored on the Va
 * row, entered by the VA on their profile page). Per birthday VA it sends a
 * happy-birthday email and drops an in-app bell notification for every OTHER
 * active console user, so teammates and management see it too.
 *
 * Gated by the `birthday_enabled` Setting (default FALSE). Idempotent per year
 * via `Va.lastBirthdayCelebratedYear`, so a rerun of the daily chain the same
 * day is a no-op. "Today" is computed in the `birthday_timezone` Setting
 * (default Asia/Manila), matching the dashboard banner and HR widget.
 */
import { db } from "@/lib/db";
import { loadSettings, str } from "@/lib/settings";
import { sendSystemEmail } from "@/lib/email";
import { createNotification } from "@/lib/inbox";
import { isBirthdayToday, dateInTz, DEFAULT_BIRTHDAY_TZ } from "@/lib/birthdays";

function emailBody(firstName: string): string {
  return [
    `Happy birthday, ${firstName}! 🎂🎉`,
    ``,
    `Everyone at Pure Water Automations is celebrating you today. Thank you for everything you bring to the team — we hope your day is full of joy (and cake).`,
    ``,
    `Warmly,`,
    `The Pure Water team`,
  ].join("\n");
}

async function main() {
  const run = await db.syncRun.create({ data: { worker: "birthday", status: "FAILED" } });
  try {
    const settings = await loadSettings();
    const enabled = str(settings, "birthday_enabled", "FALSE").toUpperCase() === "TRUE";
    if (!enabled) {
      await db.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { skipped: true, reason: "birthday_enabled not TRUE" } } });
      console.log("birthday: disabled (birthday_enabled is off) — skipped");
      return;
    }
    const from = str(settings, "system_email_from", "");
    const tz = str(settings, "birthday_timezone", DEFAULT_BIRTHDAY_TZ);
    const now = new Date();
    const { year } = dateInTz(now, tz);

    const candidates = await db.va.findMany({
      where: { status: { in: ["active", "training"] }, birthdayMonth: { not: null }, birthdayDay: { not: null } },
      select: { vaId: true, name: true, email: true, birthdayMonth: true, birthdayDay: true, lastBirthdayCelebratedYear: true },
    });
    const celebrants = candidates.filter(
      (va) => isBirthdayToday(va.birthdayMonth, va.birthdayDay, now, tz) && va.lastBirthdayCelebratedYear !== year,
    );

    let emailed = 0;
    let notified = 0;
    for (const va of celebrants) {
      // Claim the year FIRST so a crash mid-send can't double-celebrate on retry.
      await db.va.update({ where: { vaId: va.vaId }, data: { lastBirthdayCelebratedYear: year } });

      const firstName = va.name.split(" ")[0] ?? va.name;
      if (from && va.email) {
        try {
          await sendSystemEmail({
            from,
            to: va.email,
            subject: `Happy birthday, ${firstName}! 🎂`,
            body: emailBody(firstName),
          });
          emailed++;
        } catch (err) {
          console.error(`birthday: email to ${va.email} failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      // Bell ping for everyone else (createNotification is best-effort by design).
      const users = await db.user.findMany({
        where: { active: true, email: { not: va.email.toLowerCase() } },
        select: { id: true },
      });
      for (const u of users) {
        await createNotification(u.id, "birthday", `It's ${va.name}'s birthday today! 🎂 Send them some love.`, "/directory");
        notified++;
      }
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        detailsJson: { celebrants: celebrants.map((c) => c.name), emailed, notified, tz, configuredFrom: !!from },
      },
    });
    console.log(`birthday: ${celebrants.length} celebrant(s), ${emailed} email(s), ${notified} bell notification(s)`);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`birthday failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
