// PWA Skills Trial — schedule and window calculation pure logic (docs/skills-trial/02-candidate-experience.md §3-4).
// All functions are pure, unit-testable, and stateless.

import type { DeclaredBlock } from "./types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface BlockWindowInfo {
  block: DeclaredBlock;
  startHour: number; // 0-24
  endHour: number; // 0-24
  label: string;
}

/**
 * Parse timezone string (e.g. 'GMT+8 — Manila', 'GMT+8', 'GMT-05:00', 'UTC+05:30') into minute offset from UTC.
 * Returns positive minutes for East of UTC (e.g. GMT+8 -> 480) and negative for West of UTC (e.g. GMT-5 -> -300).
 */
export function parseTimezoneOffset(tz: string | null | undefined): number {
  if (!tz) return 0;
  const clean = tz.trim();

  // Match standard GMT/UTC prefix with optional offset
  const match = clean.match(/(?:GMT|UTC)?\s*([+-]|−)\s*(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) {
    // Check if there is any bare +8 or -5 when no GMT/UTC keyword
    const bareMatch = clean.match(/^([+-]|−)\s*(\d{1,2})(?::?(\d{2}))?/);
    if (!bareMatch) return 0;
    const sign = bareMatch[1] === "-" || bareMatch[1] === "−" ? -1 : 1;
    const hours = parseInt(bareMatch[2], 10);
    const minutes = bareMatch[3] ? parseInt(bareMatch[3], 10) : 0;
    return sign * (hours * 60 + minutes);
  }

  const sign = match[1] === "-" || match[1] === "−" ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

/**
 * Returns a Date shifted by the candidate's timezone offset such that UTC methods
 * (getUTCHours, getUTCDay, getUTCDate, etc.) directly reflect candidate local wall-clock date/time.
 */
export function candidateLocalTime(now: Date, tz: string): Date {
  const offsetMinutes = parseTimezoneOffset(tz);
  return new Date(now.getTime() + offsetMinutes * 60 * 1000);
}

/**
 * Convert a candidate-local Date (where UTC calendar/hour/minute methods reflect local time)
 * back into the real UTC timestamp Date.
 */
export function localToUtcTime(localDate: Date, tz: string): Date {
  const offsetMinutes = parseTimezoneOffset(tz);
  return new Date(localDate.getTime() - offsetMinutes * 60 * 1000);
}

/**
 * Check if the given UTC timestamp `now` falls on a candidate-declared workday.
 */
export function isDeclaredDay(
  now: Date,
  tz: string,
  declaredDays: string[] | string
): boolean {
  const list = typeof declaredDays === "string"
    ? declaredDays.split(",").map(s => s.trim()).filter(Boolean)
    : declaredDays;
  if (!list || list.length === 0) return false;

  const local = candidateLocalTime(now, tz);
  const localDayIndex = local.getUTCDay();
  const localDayName = DAY_NAMES[localDayIndex];

  return list.some(d => {
    const clean = d.trim().slice(0, 3).toLowerCase();
    return clean === localDayName.toLowerCase();
  });
}

/**
 * Returns hour boundaries and labels for candidate declared blocks.
 * Morning: 06:00-12:00, Afternoon: 12:00-18:00, Evening: 18:00-24:00 candidate-local.
 */
export function blockWindow(declaredBlock: DeclaredBlock | string): BlockWindowInfo {
  const normalized = String(declaredBlock || "").trim().toLowerCase();
  if (normalized === "afternoon") {
    return { block: "Afternoon", startHour: 12, endHour: 18, label: "12:00-18:00" };
  }
  if (normalized === "evening") {
    return { block: "Evening", startHour: 18, endHour: 24, label: "18:00-24:00" };
  }
  return { block: "Morning", startHour: 6, endHour: 12, label: "06:00-12:00" };
}

/**
 * Check if `now` (UTC) is strictly within the candidate's declared working window today.
 * Fairness rule: no reminders or penalty flags outside this window.
 */
export function isWithinDeclaredWindow(
  now: Date,
  tz: string,
  declaredDays: string[] | string,
  declaredBlock: DeclaredBlock | string
): boolean {
  if (!isDeclaredDay(now, tz, declaredDays)) {
    return false;
  }
  const local = candidateLocalTime(now, tz);
  const hour = local.getUTCHours();
  const minute = local.getUTCMinutes();
  const second = local.getUTCSeconds();
  const timeInHours = hour + minute / 60 + second / 3600;

  const window = blockWindow(declaredBlock);
  return timeInHours >= window.startHour && timeInHours < window.endHour;
}

/**
 * Returns the exact UTC Date timestamp when the next declared window opens relative to `now`.
 * If today is a declared day and we are strictly before today's startHour, returns today's window open.
 * Otherwise, searches forward day-by-day for the next declared day.
 */
export function nextWindowOpen(
  now: Date,
  tz: string,
  declaredDays: string[] | string,
  declaredBlock: DeclaredBlock | string
): Date {
  const window = blockWindow(declaredBlock);
  const offsetMinutes = parseTimezoneOffset(tz);
  const local = candidateLocalTime(now, tz);
  const timeInHours = local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600;

  // If today is a declared day and we are strictly before startHour
  if (isDeclaredDay(now, tz, declaredDays) && timeInHours < window.startHour) {
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const day = local.getUTCDate();
    const localDateAsUTC = Date.UTC(year, month, day, window.startHour, 0, 0, 0);
    return new Date(localDateAsUTC - offsetMinutes * 60 * 1000);
  }

  // Search forward up to 14 days
  let testLocal = new Date(local.getTime() + 24 * 3600 * 1000);
  for (let i = 0; i < 14; i++) {
    const testUTC = new Date(testLocal.getTime() - offsetMinutes * 60 * 1000);
    if (isDeclaredDay(testUTC, tz, declaredDays)) {
      const year = testLocal.getUTCFullYear();
      const month = testLocal.getUTCMonth();
      const day = testLocal.getUTCDate();
      const localDateAsUTC = Date.UTC(year, month, day, window.startHour, 0, 0, 0);
      return new Date(localDateAsUTC - offsetMinutes * 60 * 1000);
    }
    testLocal = new Date(testLocal.getTime() + 24 * 3600 * 1000);
  }

  // Fallback if declaredDays is empty/invalid: return tomorrow at window.startHour
  const tomorrow = new Date(local.getTime() + 24 * 3600 * 1000);
  const year = tomorrow.getUTCFullYear();
  const month = tomorrow.getUTCMonth();
  const day = tomorrow.getUTCDate();
  const localDateAsUTC = Date.UTC(year, month, day, window.startHour, 0, 0, 0);
  return new Date(localDateAsUTC - offsetMinutes * 60 * 1000);
}

/**
 * Returns the exact UTC timestamp when today's wrap-up check-in window opens
 * (the last hour of the declared block on a declared workday).
 * Returns null if today (`now`) is not a declared workday.
 */
export function checkinDueAt(
  now: Date,
  tz: string,
  declaredDays: string[] | string,
  declaredBlock: DeclaredBlock | string
): Date | null {
  if (!isDeclaredDay(now, tz, declaredDays)) {
    return null;
  }
  const window = blockWindow(declaredBlock);
  const checkinOpenHour = window.endHour - 1; // e.g. 11, 17, or 23

  const local = candidateLocalTime(now, tz);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();

  const localDateAsUTC = Date.UTC(year, month, day, checkinOpenHour, 0, 0, 0);
  const offsetMinutes = parseTimezoneOffset(tz);
  return new Date(localDateAsUTC - offsetMinutes * 60 * 1000);
}

/**
 * Decide whether to trigger a check-in reminder.
 * Escalating gaps:
 *  - remindersSentCount === 0: 1st reminder after 2h unanswered inside the window.
 *  - remindersSentCount === 1: 2nd reminder at next window open.
 *  - remindersSentCount >= 2: capped (no more reminders).
 * Fairness rule: NEVER remind outside the candidate's declared window.
 */
export function shouldRemind(
  lastCheckinRequestedAt: Date,
  remindersSentCount: number,
  now: Date,
  tz: string = "GMT+8",
  declaredDays: string[] | string = "Mon,Tue,Wed,Thu,Fri",
  declaredBlock: DeclaredBlock | string = "Morning",
  lastReminderSentAt?: Date | null
): boolean {
  if (remindersSentCount >= 2) {
    return false;
  }
  if (!isWithinDeclaredWindow(now, tz, declaredDays, declaredBlock)) {
    return false;
  }

  if (remindersSentCount === 0) {
    const elapsedMs = now.getTime() - lastCheckinRequestedAt.getTime();
    return elapsedMs >= 2 * 3600 * 1000;
  }

  // remindersSentCount === 1: second reminder at next window open after first reminder
  const anchor = lastReminderSentAt ?? new Date(lastCheckinRequestedAt.getTime() + 2 * 3600 * 1000);
  const nextOpen = nextWindowOpen(anchor, tz, declaredDays, declaredBlock);
  return now.getTime() >= nextOpen.getTime();
}

/**
 * Calculate 1-based trial day relative to startDate and candidate local timezone.
 */
export function currentTrialDay(startDate: Date, now: Date, tz: string): number {
  const startLocal = candidateLocalTime(startDate, tz);
  const nowLocal = candidateLocalTime(now, tz);
  const startDayUTC = Date.UTC(startLocal.getUTCFullYear(), startLocal.getUTCMonth(), startLocal.getUTCDate());
  const nowDayUTC = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate());
  const diffDays = Math.floor((nowDayUTC - startDayUTC) / (24 * 3600 * 1000));
  return Math.max(1, diffDays + 1);
}

export const SIX_HOURS_SEC = 6 * 3600;

/**
 * Calculate the capped seconds delta for the 6-hour timer sweep.
 */
export function calculateTimerCapDelta(
  timerStartedAt: Date,
  now: Date = new Date(),
  capSeconds: number = SIX_HOURS_SEC
): { timedOut: boolean; deltaSeconds: number } {
  const elapsed = Math.floor((now.getTime() - timerStartedAt.getTime()) / 1000);
  if (elapsed >= capSeconds) {
    return { timedOut: true, deltaSeconds: capSeconds };
  }
  return { timedOut: false, deltaSeconds: Math.max(0, elapsed) };
}
