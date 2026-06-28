/**
 * Native discovery-call booking — server actions over the pure slot engine.
 * Availability = rep windows minus already-booked calls minus (when a rep has
 * connected their Google Calendar) their real busy times; booking creates a GCal
 * event with a Meet link when possible and always sends an .ics email as the
 * durable fallback. Mirrors the recruitment magic-link pattern.
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, num, str } from "@/lib/settings";
import {
  parseBookingConfig,
  generateSlots,
  isSlotOpen,
  buildIcs,
  toBusyMs,
  type BookingRep,
  type SlotOptions,
  type Slot,
  type BusyMs,
} from "@/lib/discovery-booking";
import { resolveRepCalendar, connectedReps } from "@/lib/calendar-connection";
import { freeBusy, createEvent, updateEventTime, deleteEvent } from "@/lib/google/calendar";

export class BookingError extends Error {}

// Stages from which a token may (re)book a call. Once a deal is in proposal/won/
// lost/etc. a stale link can no longer move it.
const BOOKABLE_STAGES = new Set(["new", "discovery_scheduled", "nurture", "no_show"]);

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bookingConfig(settings: Map<string, string>): { reps: BookingRep[]; opts: SlotOptions; tzLabel: string; horizonDays: number } {
  const horizonDays = num(settings, "discovery_horizon_days", 10);
  const tz = str(settings, "discovery_tz", "America/New_York");
  return {
    reps: parseBookingConfig(settings.get("discovery_booking_windows")),
    opts: {
      slotMinutes: num(settings, "discovery_slot_minutes", 30),
      horizonDays,
      tz: tz || undefined,
      tzOffsetMinutes: num(settings, "discovery_tz_offset_minutes", -300),
      leadMinutes: num(settings, "discovery_lead_minutes", 120),
    },
    tzLabel: str(settings, "discovery_tz_label", "US Eastern"),
    horizonDays,
  };
}

/** Currently-scheduled future calls within the horizon, as booked-slot rows. */
async function bookedSlots(horizonDays: number): Promise<{ repEmail: string; startIso: string; dealId: string }[]> {
  const now = new Date();
  const until = new Date(now.getTime() + (horizonDays + 1) * 86_400_000);
  const rows = await db.deal.findMany({
    where: { discoveryCallStatus: "scheduled", discoveryCallAt: { gte: now, lte: until } },
    select: { id: true, discoveryRepEmail: true, discoveryCallAt: true },
  });
  return rows
    .filter((r) => r.discoveryRepEmail && r.discoveryCallAt)
    .map((r) => ({ repEmail: r.discoveryRepEmail as string, startIso: (r.discoveryCallAt as Date).toISOString(), dealId: r.id }));
}

function repLoadFrom(booked: { repEmail: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of booked) m.set(b.repEmail, (m.get(b.repEmail) ?? 0) + 1);
  return m;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/**
 * Per-rep Google Calendar busy times over the horizon. Best-effort + bounded:
 * only reps with an active calendar connection are queried (in parallel, with a
 * timeout); a failure/timeout just omits that rep, so booking never blocks on
 * Google and reps without a connection stay bookable via DB availability alone.
 */
async function repBusy(reps: BookingRep[], horizonDays: number): Promise<Map<string, BusyMs[]>> {
  const busy = new Map<string, BusyMs[]>();
  const emails = reps.map((r) => r.email);
  const connected = await connectedReps(emails).catch(() => new Set<string>());
  if (!connected.size) return busy;
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + (horizonDays + 1) * 86_400_000).toISOString();
  await Promise.all(
    reps
      .filter((r) => connected.has(r.email.toLowerCase()))
      .map(async (r) => {
        try {
          const cal = await resolveRepCalendar(r.email);
          if (!cal) return;
          const intervals = await withTimeout(freeBusy(cal.auth, cal.calendarId, timeMin, timeMax), 4000);
          busy.set(r.email.toLowerCase(), toBusyMs(intervals));
        } catch {
          /* best-effort — omit this rep's calendar busy times */
        }
      }),
  );
  return busy;
}

/** Open slots the public picker shows (union across reps, deduped by instant). */
export async function getOpenSlots(): Promise<Slot[]> {
  const settings = await loadSettings();
  const { reps, opts, horizonDays } = bookingConfig(settings);
  if (!reps.length) return [];
  const booked = await bookedSlots(horizonDays);
  const busy = await repBusy(reps, horizonDays);
  return generateSlots(reps, opts, new Date(), booked, repLoadFrom(booked), busy);
}

/** A friendly wall-clock string in the configured timezone. */
function formatSlot(startIso: string, opts: SlotOptions, tzLabel: string): string {
  if (opts.tz) {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: opts.tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(new Date(startIso));
    return `${s} ${tzLabel}`;
  }
  const d = new Date(new Date(startIso).getTime() + (opts.tzOffsetMinutes ?? -300) * 60_000);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${DAY_NAMES[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${h}:${d.getUTCMinutes().toString().padStart(2, "0")} ${ampm} ${tzLabel}`;
}

async function loadDealByToken(token: string) {
  if (!token) throw new BookingError("This link is invalid.");
  const deal = await db.deal.findUnique({ where: { discoveryCallToken: token } });
  if (!deal) throw new BookingError("This booking link is invalid or has expired.");
  return deal;
}

/** Public read for the /discovery/[token] page. */
export async function getBookingByToken(token: string) {
  const deal = await db.deal.findUnique({
    where: { discoveryCallToken: token },
    select: { orgName: true, contactName: true, discoveryCallAt: true, discoveryCallStatus: true, discoveryCallVideoUrl: true },
  });
  if (!deal) return null;
  const { opts, tzLabel } = bookingConfig(await loadSettings());
  return {
    orgName: deal.orgName,
    contactName: deal.contactName,
    status: deal.discoveryCallStatus,
    videoUrl: deal.discoveryCallVideoUrl,
    callAtIso: deal.discoveryCallAt ? deal.discoveryCallAt.toISOString() : null,
    callAtLabel: deal.discoveryCallAt ? formatSlot(deal.discoveryCallAt.toISOString(), opts, tzLabel) : null,
  };
}

/** Book (or reschedule) the discovery call for the lead identified by `token`. */
export async function bookDiscoveryCall(token: string, startIso: string) {
  const deal = await loadDealByToken(token);
  if (!BOOKABLE_STAGES.has(deal.stage)) throw new BookingError("This booking link is no longer active.");

  const settings = await loadSettings();
  const { reps, opts, tzLabel, horizonDays } = bookingConfig(settings);
  if (!reps.length) throw new BookingError("Booking isn't available right now — we'll reach out to schedule.");

  // Re-check the slot is real and open (DB bookings + the reps' GCal busy times),
  // excluding only THIS deal's own current booking.
  const allBooked = await bookedSlots(horizonDays);
  const booked = allBooked.filter((b) => b.dealId !== deal.id);
  const busy = await repBusy(reps, horizonDays);
  const slot = isSlotOpen(reps, opts, new Date(), booked, startIso, repLoadFrom(booked), busy);
  if (!slot) throw new BookingError("That time was just taken — please pick another.");

  const rep = reps.find((r) => r.email === slot.repEmail);
  let videoUrl = rep?.videoUrl || str(settings, "discovery_call_video_url") || null;
  const wasBooked = !!deal.discoveryCallAt;
  const prevRepEmail = deal.discoveryRepEmail;
  const prevEventId = deal.discoveryCalEventId;
  const prevCalId = deal.discoveryCalId;

  try {
    await db.deal.update({
      where: { id: deal.id },
      data: {
        discoveryCallAt: new Date(slot.startIso),
        discoveryCallEndAt: new Date(slot.endIso),
        discoveryCallStatus: "scheduled",
        discoveryRepEmail: slot.repEmail,
        accountOwnerEmail: slot.repEmail,
        discoveryCallVideoUrl: videoUrl,
        discoveryReminderSentAt: null, // a fresh time needs a fresh reminder
        stage: "discovery_scheduled",
        lastContactAt: new Date(),
      },
    });
  } catch (err) {
    // Race: the partial unique index (rep, time) WHERE scheduled rejected a concurrent grab.
    if ((err as { code?: string }).code === "P2002") throw new BookingError("That time was just taken — please pick another.");
    throw err;
  }

  const company = str(settings, "company_name", "Pure Water Automations");
  const label = formatSlot(slot.startIso, opts, tzLabel);

  // Best-effort Google Calendar event (with a Meet link). On reschedule, move the
  // existing event; if the rep changed, remove the old event first. The .ics email
  // below is always the durable fallback, so a Google failure never breaks booking.
  let calEventId = prevEventId;
  let calId = prevCalId;
  try {
    const cal = await resolveRepCalendar(slot.repEmail);
    if (cal) {
      const sameEvent = wasBooked && !!prevEventId && prevCalId === cal.calendarId && prevRepEmail?.toLowerCase() === slot.repEmail.toLowerCase();
      if (sameEvent) {
        await updateEventTime(cal.auth, cal.calendarId, prevEventId!, slot.startIso, slot.endIso);
      } else {
        if (wasBooked && prevEventId && prevCalId && prevRepEmail) {
          const oldCal = await resolveRepCalendar(prevRepEmail).catch(() => null);
          if (oldCal) await deleteEvent(oldCal.auth, prevCalId, prevEventId).catch(() => {});
        }
        const created = await createEvent(cal.auth, cal.calendarId, {
          summary: `Discovery call — ${company} × ${deal.orgName}`,
          description: "A free 30-minute discovery call to map out how we can help.",
          startIso: slot.startIso,
          endIso: slot.endIso,
          attendees: [deal.contactEmail, slot.repEmail].filter(Boolean) as string[],
          meetRequestId: randomUUID(),
        });
        calEventId = created.eventId || null;
        calId = cal.calendarId;
        if (created.meetLink) videoUrl = created.meetLink;
      }
      await db.deal.update({
        where: { id: deal.id },
        data: { discoveryCalEventId: calEventId, discoveryCalId: calId, ...(videoUrl ? { discoveryCallVideoUrl: videoUrl } : {}) },
      });
    }
  } catch {
    /* best-effort — the .ics email is the durable invite */
  }

  await logActivity({
    source: "sales",
    eventType: wasBooked ? "discovery_call_rescheduled" : "discovery_call_booked",
    summary: `${deal.orgName}: discovery call ${wasBooked ? "moved to" : "booked"} ${label} with ${slot.repEmail}`,
  });

  await sendBookingEmails(settings, {
    dealId: deal.id, orgName: deal.orgName, leadEmail: deal.contactEmail, leadName: deal.contactName,
    repEmail: slot.repEmail, startIso: slot.startIso, endIso: slot.endIso, videoUrl, label, rescheduled: wasBooked,
  }).catch(() => {});

  return { ok: true, startIso: slot.startIso, label, repEmail: slot.repEmail };
}

/** Cancel the booked call; the lead can re-book with the same link. */
export async function cancelDiscoveryCall(token: string) {
  const deal = await loadDealByToken(token);
  if (deal.discoveryCallStatus !== "scheduled" || !deal.discoveryCallAt) {
    return { ok: true, alreadyCancelled: true };
  }
  const settings = await loadSettings();
  const { opts, tzLabel } = bookingConfig(settings);
  const startIso = deal.discoveryCallAt.toISOString();
  const endIso = (deal.discoveryCallEndAt ?? deal.discoveryCallAt).toISOString();

  // Best-effort: remove the Google Calendar event so the rep's calendar clears.
  if (deal.discoveryCalEventId && deal.discoveryCalId) {
    try {
      const cal = await resolveRepCalendar(deal.discoveryRepEmail);
      if (cal) await deleteEvent(cal.auth, deal.discoveryCalId, deal.discoveryCalEventId);
    } catch {
      /* best-effort — the CANCEL .ics below still clears the lead's calendar */
    }
  }

  await db.deal.update({
    where: { id: deal.id },
    data: {
      discoveryCallStatus: "cancelled",
      discoveryCallAt: null,
      discoveryCallEndAt: null,
      discoveryCalEventId: null,
      discoveryCalId: null,
      discoveryReminderSentAt: null,
      // only step the pipeline back if it was sitting at discovery_scheduled
      ...(deal.stage === "discovery_scheduled" ? { stage: "new" as const } : {}),
      lastContactAt: new Date(),
    },
  });
  await logActivity({ source: "sales", eventType: "discovery_call_cancelled", severity: "warning", summary: `${deal.orgName}: discovery call cancelled` });

  const from = str(settings, "system_email_from");
  const to = [deal.contactEmail, deal.discoveryRepEmail].filter(Boolean) as string[];
  if (from && to.length) {
    const company = str(settings, "company_name", "Pure Water Automations");
    const ics = buildIcs({
      uid: `discovery-${deal.id}@pwa`, method: "CANCEL", sequence: 1,
      startIso, endIso, summary: `Discovery call — ${company} × ${deal.orgName}`,
      description: "This discovery call has been cancelled.",
      organizerEmail: deal.discoveryRepEmail || from, attendeeEmail: deal.contactEmail || from,
      location: deal.discoveryCallVideoUrl || undefined, dtstampIso: new Date().toISOString(),
    });
    await sendSystemEmail({
      from, to,
      subject: `Discovery call cancelled — ${deal.orgName} (${formatSlot(startIso, opts, tzLabel)})`,
      body: `The discovery call for ${deal.orgName} has been cancelled.\n\nYou can pick a new time any time using your booking link.`,
      attachments: [{ filename: "discovery-call-cancelled.ics", content: Buffer.from(ics, "utf8"), mimeType: "text/calendar; method=CANCEL" }],
    }).catch(() => {});
  }
  return { ok: true };
}

async function sendBookingEmails(
  settings: Map<string, string>,
  b: {
    dealId: string; orgName: string; leadEmail: string | null; leadName: string | null;
    repEmail: string; startIso: string; endIso: string; videoUrl: string | null; label: string; rescheduled: boolean;
  },
) {
  const from = str(settings, "system_email_from");
  if (!from) return;
  const company = str(settings, "company_name", "Pure Water Automations");
  const ics = buildIcs({
    uid: `discovery-${b.dealId}@pwa`, sequence: b.rescheduled ? 1 : 0,
    startIso: b.startIso, endIso: b.endIso,
    summary: `Discovery call — ${company} × ${b.orgName}`,
    description: `A free 30-minute discovery call.${b.videoUrl ? ` Join: ${b.videoUrl}` : ""}`,
    organizerEmail: b.repEmail, attendeeEmail: b.leadEmail || b.repEmail,
    location: b.videoUrl || undefined, dtstampIso: new Date().toISOString(),
  });
  const attachments = [{ filename: "discovery-call.ics", content: Buffer.from(ics, "utf8"), mimeType: "text/calendar; method=REQUEST" }];
  const verb = b.rescheduled ? "rescheduled" : "confirmed";

  if (b.leadEmail) {
    await sendSystemEmail({
      from, to: b.leadEmail, attachments,
      subject: `Your discovery call is ${verb} — ${b.label}`,
      body:
        `Hi${b.leadName ? ` ${b.leadName}` : ""},\n\n` +
        `Your free discovery call with ${company} is ${verb}:\n\n  ${b.label}\n` +
        (b.videoUrl ? `  Join here: ${b.videoUrl}\n` : "") +
        `\nWe've attached a calendar invite. See you then!\n\n— ${company}`,
    });
  }
  await sendSystemEmail({
    from, to: b.repEmail, attachments,
    subject: `Discovery call ${verb}: ${b.orgName} — ${b.label}`,
    body: `${b.orgName} ${b.rescheduled ? "moved" : "booked"} a discovery call.\n\n  ${b.label}\n  Lead: ${b.leadName ?? b.leadEmail ?? "—"}\n${b.videoUrl ? `  Join: ${b.videoUrl}\n` : ""}`,
  });
}
