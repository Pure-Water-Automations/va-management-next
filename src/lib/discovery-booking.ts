/**
 * Native discovery-call booking — pure slot engine + iCalendar builder, shared by
 * the public slot picker and the server booking actions so the two never drift.
 * No DB, no network: availability is computed from rep windows minus already-booked
 * slots; the confirmation email carries an .ics invite (no Google Calendar API).
 */

export type BookingWindow = {
  day: number; // 0=Sun … 6=Sat
  start: string; // "HH:MM" in the configured timezone
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
  tzOffsetMinutes?: number; // minutes to add to UTC to get the rep-local wall time (e.g. US Eastern = -300)
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

/**
 * Generate the union of open slots across all reps over the horizon, deduped by
 * start time (the lead never sees which rep — one slot per instant, assigned to a
 * single rep). Past / inside-the-lead-window / already-booked slots are dropped.
 * Pure: `now` and the tz offset are passed in.
 */
export function generateSlots(
  reps: BookingRep[],
  opts: SlotOptions,
  now: Date,
  booked: { repEmail: string; startIso: string }[],
): Slot[] {
  const slotMinutes = opts.slotMinutes ?? 30;
  const horizonDays = opts.horizonDays ?? 10;
  const tzOffsetMinutes = opts.tzOffsetMinutes ?? -300;
  const leadMinutes = opts.leadMinutes ?? 120;

  const bookedSet = new Set(booked.map((b) => `${b.repEmail.toLowerCase()}|${b.startIso}`));
  const minMs = now.getTime() + leadMinutes * 60_000;

  const byStart = new Map<string, Slot>();
  const baseY = now.getUTCFullYear();
  const baseM = now.getUTCMonth();
  const baseD = now.getUTCDate();

  for (let d = 0; d <= horizonDays; d++) {
    const day = new Date(Date.UTC(baseY, baseM, baseD + d));
    const weekday = day.getUTCDay();
    for (const rep of reps) {
      for (const w of rep.windows) {
        if (w.day !== weekday) continue;
        const startMin = minutesOf(w.start);
        const endMin = minutesOf(w.end);
        for (let t = startMin; t + slotMinutes <= endMin; t += slotMinutes) {
          const localMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Math.floor(t / 60), t % 60);
          const startMs = localMs - tzOffsetMinutes * 60_000;
          if (startMs < minMs) continue;
          const startIso = new Date(startMs).toISOString();
          if (bookedSet.has(`${rep.email}|${startIso}`)) continue;
          if (byStart.has(startIso)) continue; // dedupe across reps: first rep wins
          byStart.set(startIso, {
            startIso,
            endIso: new Date(startMs + slotMinutes * 60_000).toISOString(),
            repEmail: rep.email,
            repName: rep.name,
          });
        }
      }
    }
  }
  return [...byStart.values()].sort((a, b) => (a.startIso < b.startIso ? -1 : a.startIso > b.startIso ? 1 : 0));
}

/** Is `startIso` a real, still-open slot for `repEmail`? (re-checked at booking time). */
export function isSlotOpen(
  reps: BookingRep[],
  opts: SlotOptions,
  now: Date,
  booked: { repEmail: string; startIso: string }[],
  startIso: string,
): Slot | null {
  return generateSlots(reps, opts, now, booked).find((s) => s.startIso === startIso) ?? null;
}

function icsStamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Build a minimal VCALENDAR invite for the booked call (attached to the email). */
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
  dtstampIso: string;
}): string {
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pure Water Automations//Discovery//EN",
    `METHOD:${input.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${icsStamp(input.dtstampIso)}`,
    `DTSTART:${icsStamp(input.startIso)}`,
    `DTEND:${icsStamp(input.endIso)}`,
    `SUMMARY:${esc(input.summary)}`,
    `DESCRIPTION:${esc(input.description)}`,
    `ORGANIZER:mailto:${input.organizerEmail}`,
    `ATTENDEE;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    input.location ? `LOCATION:${esc(input.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}
