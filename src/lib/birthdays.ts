/**
 * Birthday date math shared by the VA dashboard banner, the HR "upcoming
 * birthdays" widget, and the daily birthday worker — so all three always agree.
 *
 * Birthdays are stored as month+day only (no year, for privacy). "Today" is
 * computed in a single team timezone (Setting `birthday_timezone`, default
 * Asia/Manila) so the celebration fires on the VA's calendar day, not UTC's.
 * Feb 29 is treated as Mar 1 in non-leap years (Date auto-rolls, which is the
 * behavior we want).
 */

export const DEFAULT_BIRTHDAY_TZ = "Asia/Manila";

/** The {year, month, day} of `now` as seen in `tz` (month 1-12). */
export function dateInTz(now: Date, tz: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Resolve a stored month/day to its concrete occurrence in `year` (Feb 29 → Mar 1 off-leap). */
function occurrence(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function isBirthdayToday(
  month: number | null | undefined,
  day: number | null | undefined,
  now: Date,
  tz: string,
): boolean {
  if (!month || !day) return false;
  const today = dateInTz(now, tz);
  const occ = occurrence(today.year, month, day); // normalizes Feb 29 off-leap
  return occ.getUTCMonth() + 1 === today.month && occ.getUTCDate() === today.day;
}

export type UpcomingBirthday<T> = { va: T; month: number; day: number; inDays: number; date: Date };

/**
 * VAs whose birthday falls within the next `days` days (0 = today), handling
 * year wraparound (late-December birthdays seen from Dec 28, etc.). Roster is
 * tiny, so plain JS beats wraparound SQL.
 */
export function upcomingBirthdays<T extends { birthdayMonth: number | null; birthdayDay: number | null }>(
  vas: T[],
  now: Date,
  tz: string,
  days = 7,
): UpcomingBirthday<T>[] {
  const today = dateInTz(now, tz);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const out: UpcomingBirthday<T>[] = [];
  for (const va of vas) {
    if (!va.birthdayMonth || !va.birthdayDay) continue;
    // Consider this year's and next year's occurrence; keep the first in-window one.
    for (const year of [today.year, today.year + 1]) {
      const occ = occurrence(year, va.birthdayMonth, va.birthdayDay);
      const diff = Math.round((occ.getTime() - todayUtc) / 86_400_000);
      if (diff >= 0 && diff <= days) {
        out.push({ va, month: va.birthdayMonth, day: va.birthdayDay, inDays: diff, date: occ });
        break;
      }
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jul 7" — display form of a stored month/day. */
export function birthdayLabel(month: number, day: number): string {
  return `${MONTHS[month - 1] ?? "?"} ${day}`;
}

/** Days in a month, using a leap year so Feb 29 stays enterable. */
export function daysInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}
