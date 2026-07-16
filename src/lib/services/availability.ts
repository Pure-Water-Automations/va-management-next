/** Typical time-availability window a VA reports at check-in, in decimal EST/EDT hours (0-24). */
export function isAvailableNow(
  startHour: number | null | undefined,
  endHour: number | null | undefined,
  currentHour: number,
): boolean {
  if (startHour == null || endHour == null || startHour === endHour) return false;
  if (startHour < endHour) return currentHour >= startHour && currentHour < endHour;
  return currentHour >= startHour || currentHour < endHour; // overnight wrap
}

/** Formats a decimal hour (0-24, half-hour steps) as "6:00 AM" / "12:30 PM". */
export function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const wholeHour = Math.floor(h) % 12;
  const h12 = wholeHour === 0 ? 12 : wholeHour;
  const min = h % 1 >= 0.5 ? "30" : "00";
  return `${h12}:${min} ${period}`;
}

/** Decimal hour-of-day (0-24) for a UTC instant, in America/New_York local time. */
export function estHourNow(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour + minute / 60;
}
