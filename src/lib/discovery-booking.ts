/**
 * Native discovery-call booking — pure slot engine + iCalendar builder, shared by
 * the public slot picker and the server booking actions so the two never drift.
 * No DB, no network: availability is computed from rep windows minus already-booked
 * slots; the confirmation email carries an .ics invite (no Google Calendar API).
 *
 * Timezone: pass an IANA zone (e.g. "America/New_York") so wall-clock windows map
 * to the correct UTC instants across DST. A fixed `tzOffsetMinutes` is supported as
 * a fallback for tests / zones without DST.
 */

export type BookingWindow = {
  day: number; // 0=Sun … 6=Sat (weekday in the rep's timezone)
  start: string; // "HH:MM" local wall time
  end: string; // "HH:MM"
};

export type BookingRep = {
  email: string;
  name?: string;
  windows: BookingWindow[];
  videoUrl?: string;
};

export type Slot = { startIso: string; endIso: string; repEmail: string; repName?: string };

export type SlotOptions = {
  slotMinutes?: number; // default 30
  horizonDays?: number; // how many days ahead to offer (default 10)
  tz?: string; // IANA zone, e.g. "America/New_York" (preferred — DST-correct)
  tzOffsetMinutes?: number; // fallback fixed offset (minutes east of UTC), default -300
  leadMinutes?: number; // minimum notice before a slot can be booked (default 120)
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse the `discovery_booking_windows` setting (JSON) into a rep list. Tolerant of junk. */
export function parseBookingConfig(value: string | undefined | null): BookingRep[] {
  if (!value || !value.trim()) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const reps: BookingRep[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
    if (!email) continue;
    const windowsRaw = Array.isArray(r.windows) ? (r.windows as Record<string, unknown>[]) : [];
    const windows: BookingWindow[] = [];
    for (const w of windowsRaw) {
      const day = Number(w.day);
      const start = typeof w.start === "string" ? w.start : "";
      const end = typeof w.end === "string" ? w.end : "";
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      if (!HHMM.test(start) || !HHMM.test(end) || start >= end) continue;
      windows.push({ day, start, end });
    }
    reps.push({
      email,
      name: typeof r.name === "string" ? r.name : undefined,
      videoUrl: typeof r.videoUrl === "string" ? r.videoUrl : undefined,
      windows,
    });
  }
  return reps;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes east of UTC for `date` in IANA zone `tz` (DST-aware). */
function tzOffsetFor(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return (asUTC - date.getTime()) / 60_000;
}

/** UTC ms for a local wall time, honoring the IANA zone's DST (or a fixed offset). */
function wallToUtcMs(y: number, mo: number, d: number, h: number, mi: number, opts: SlotOptions): number {
  const guess = Date.UTC(y, mo, d, h, mi);
  if (opts.tz) {
    let off = tzOffsetFor(opts.tz, new Date(guess));
    let utc = guess - off * 60_000;
    const off2 = tzOffsetFor(opts.tz, new Date(utc)); // refine across a DST edge
    if (off2 !== off) { off = off2; utc = guess - off * 60_000; }
    return utc;
  }
  return guess - (opts.tzOffsetMinutes ?? -300) * 60_000;
}

const WEEKDAY_IDX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The local calendar date + weekday of `instant` in the configured zone. */
function localDateParts(instant: Date, opts: SlotOptions): { y: number; mo: number; d: number; weekday: number } {
  if (opts.tz) {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: opts.tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
    const m: Record<string, string> = {};
    for (const p of dtf.formatToParts(instant)) m[p.type] = p.value;
    return { y: +m.year, mo: +m.month - 1, d: +m.day, weekday: WEEKDAY_IDX[m.weekday] ?? 0 };
  }
  // Fixed-offset fallback (tests / no-DST zones): approximate the local calendar
  // date with the UTC date; only the slot TIME gets the offset. Production uses the
  // IANA branch above, which is fully DST-correct.
  return { y: instant.getUTCFullYear(), mo: instant.getUTCMonth(), d: instant.getUTCDate(), weekday: instant.getUTCDay() };
}

/**
 * Generate the union of open slots across all reps over the horizon, deduped by
 * start time (the lead never sees which rep — one slot per instant). When two reps
 * are free at the same instant the LEAST-LOADED rep is assigned (`repLoad` = count
 * of scheduled calls per rep), so config order doesn't decide workload. Past /
 * inside-the-lead-window / already-booked slots are dropped. Pure: `now` is passed in.
 */
export function generateSlots(
  reps: BookingRep[],
  opts: SlotOptions,
  now: Date,
  booked: { repEmail: string; startIso: string }[],
  repLoad?: Map<string, number>,
): Slot[] {
  const slotMinutes = opts.slotMinutes ?? 30;
  const horizonDays = opts.horizonDays ?? 10;
  const leadMinutes = opts.leadMinutes ?? 120;

  const bookedSet = new Set(booked.map((b) => `${b.repEmail.toLowerCase()}|${b.startIso}`));
  const minMs = now.getTime() + leadMinutes * 60_000;
  const candidates = new Map<string, Slot[]>();

  for (let dOffset = 0; dOffset <= horizonDays; dOffset++) {
    const ref = new Date(now.getTime() + dOffset * 86_400_000);
    const { y, mo, d, weekday } = localDateParts(ref, opts);
    for (const rep of reps) {
      for (const w of rep.windows) {
        if (w.day !== weekday) continue;
        const startMin = minutesOf(w.start);
        const endMin = minutesOf(w.end);
        for (let t = startMin; t + slotMinutes <= endMin; t += slotMinutes) {
          const startMs = wallToUtcMs(y, mo, d, Math.floor(t / 60), t % 60, opts);
          if (startMs < minMs) continue;
          const startIso = new Date(startMs).toISOString();
          if (bookedSet.has(`${rep.email}|${startIso}`)) continue;
          const slot: Slot = { startIso, endIso: new Date(startMs + slotMinutes * 60_000).toISOString(), repEmail: rep.email, repName: rep.name };
          const arr = candidates.get(startIso);
          if (arr) arr.push(slot);
          else candidates.set(startIso, [slot]);
        }
      }
    }
  }

  const out: Slot[] = [];
  for (const arr of candidates.values()) {
    arr.sort((a, b) => {
      const la = repLoad?.get(a.repEmail) ?? 0;
      const lb = repLoad?.get(b.repEmail) ?? 0;
      return la !== lb ? la - lb : a.repEmail.localeCompare(b.repEmail);
    });
    out.push(arr[0]); // least-loaded rep wins this instant
  }
  return out.sort((a, b) => (a.startIso < b.startIso ? -1 : a.startIso > b.startIso ? 1 : 0));
}

/** Is `startIso` a real, still-open slot? (re-checked at booking time). */
export function isSlotOpen(
  reps: BookingRep[],
  opts: SlotOptions,
  now: Date,
  booked: { repEmail: string; startIso: string }[],
  startIso: string,
  repLoad?: Map<string, number>,
): Slot | null {
  return generateSlots(reps, opts, now, booked, repLoad).find((s) => s.startIso === startIso) ?? null;
}

function icsStamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Fold a content line to ≤75 octets per RFC 5545 (continuation lines start with a space). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

/** Build a minimal VCALENDAR invite (METHOD:REQUEST) or cancellation (METHOD:CANCEL). */
export function buildIcs(input: {
  uid: string;
  startIso: string;
  endIso: string;
  summary: string;
  description: string;
  organizerEmail: string;
  attendeeEmail: string;
  location?: string;
  method?: "REQUEST" | "CANCEL";
  sequence?: number;
  dtstampIso: string;
}): string {
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const method = input.method ?? "REQUEST";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pure Water Automations//Discovery//EN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    `DTSTAMP:${icsStamp(input.dtstampIso)}`,
    `DTSTART:${icsStamp(input.startIso)}`,
    `DTEND:${icsStamp(input.endIso)}`,
    `SUMMARY:${esc(input.summary)}`,
    `DESCRIPTION:${esc(input.description)}`,
    `ORGANIZER:mailto:${input.organizerEmail}`,
    `ATTENDEE;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    input.location ? `LOCATION:${esc(input.location)}` : "",
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(foldLine).join("\r\n");
}
