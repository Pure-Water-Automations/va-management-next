/**
 * Native discovery-call booking — server actions over the pure slot engine.
 * Our DB is the source of truth for availability (open slots = rep windows minus
 * already-booked calls); the confirmation email carries an .ics invite, so this
 * needs no Google Calendar API. Mirrors the recruitment magic-link pattern.
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
  type BookingRep,
  type SlotOptions,
  type Slot,
} from "@/lib/discovery-booking";

export class BookingError extends Error {}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bookingConfig(settings: Map<string, string>): { reps: BookingRep[]; opts: Required<SlotOptions>; tzLabel: string } {
  return {
    reps: parseBookingConfig(settings.get("discovery_booking_windows")),
    opts: {
      slotMinutes: num(settings, "discovery_slot_minutes", 30),
      horizonDays: num(settings, "discovery_horizon_days", 10),
      tzOffsetMinutes: num(settings, "discovery_tz_offset_minutes", -300),
      leadMinutes: num(settings, "discovery_lead_minutes", 120),
    },
    tzLabel: str(settings, "discovery_tz_label", "US Eastern"),
  };
}

/** Currently-scheduled calls (future), as booked-slot keys for the slot engine. */
async function bookedSlots(): Promise<{ repEmail: string; startIso: string }[]> {
  const rows = await db.deal.findMany({
    where: { discoveryCallStatus: "scheduled", discoveryCallAt: { gte: new Date() } },
    select: { discoveryRepEmail: true, discoveryCallAt: true },
  });
  return rows
    .filter((r) => r.discoveryRepEmail && r.discoveryCallAt)
    .map((r) => ({ repEmail: r.discoveryRepEmail as string, startIso: (r.discoveryCallAt as Date).toISOString() }));
}

/** Open slots the public picker shows (union across reps, deduped by instant). */
export async function getOpenSlots(): Promise<Slot[]> {
  const settings = await loadSettings();
  const { reps, opts } = bookingConfig(settings);
  if (!reps.length) return [];
  return generateSlots(reps, opts, new Date(), await bookedSlots());
}

/** A friendly wall-clock string for the configured timezone, e.g. "Mon, Jun 29 · 2:00 PM US Eastern". */
function formatSlot(startIso: string, tzOffsetMinutes: number, tzLabel: string): string {
  const d = new Date(new Date(startIso).getTime() + tzOffsetMinutes * 60_000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = m.toString().padStart(2, "0");
  return `${DAY_NAMES[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${h}:${mm} ${ampm} ${tzLabel}`;
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
    select: {
      orgName: true, contactName: true, discoveryCallAt: true, discoveryCallStatus: true,
      discoveryCallVideoUrl: true,
    },
  });
  if (!deal) return null;
  const settings = await loadSettings();
  const { opts, tzLabel } = bookingConfig(settings);
  return {
    orgName: deal.orgName,
    contactName: deal.contactName,
    status: deal.discoveryCallStatus,
    videoUrl: deal.discoveryCallVideoUrl,
    callAtIso: deal.discoveryCallAt ? deal.discoveryCallAt.toISOString() : null,
    callAtLabel: deal.discoveryCallAt ? formatSlot(deal.discoveryCallAt.toISOString(), opts.tzOffsetMinutes, tzLabel) : null,
  };
}

/** Book (or reschedule) the discovery call for the lead identified by `token`. */
export async function bookDiscoveryCall(token: string, startIso: string) {
  const deal = await loadDealByToken(token);
  const settings = await loadSettings();
  const { reps, opts, tzLabel } = bookingConfig(settings);
  if (!reps.length) throw new BookingError("Booking isn't available right now — we'll reach out to schedule.");

  // Re-check the slot is real and still open (excluding this deal's own current booking).
  const booked = (await bookedSlots()).filter((b) => b.startIso !== deal.discoveryCallAt?.toISOString());
  const slot = isSlotOpen(reps, opts, new Date(), booked, startIso);
  if (!slot) throw new BookingError("That time was just taken — please pick another.");

  const rep = reps.find((r) => r.email === slot.repEmail);
  const videoUrl = rep?.videoUrl || str(settings, "discovery_call_video_url") || null;
  const wasBooked = !!deal.discoveryCallAt;

  await db.deal.update({
    where: { id: deal.id },
    data: {
      discoveryCallAt: new Date(slot.startIso),
      discoveryCallEndAt: new Date(slot.endIso),
      discoveryCallStatus: "scheduled",
      discoveryRepEmail: slot.repEmail,
      accountOwnerEmail: slot.repEmail,
      discoveryCallVideoUrl: videoUrl,
      stage: "discovery_scheduled",
      lastContactAt: new Date(),
    },
  });

  await logActivity({
    source: "sales",
    eventType: wasBooked ? "discovery_call_rescheduled" : "discovery_call_booked",
    summary: `${deal.orgName}: discovery call ${wasBooked ? "moved to" : "booked"} ${formatSlot(slot.startIso, opts.tzOffsetMinutes, tzLabel)} with ${slot.repEmail}`,
  });

  await sendBookingEmails(settings, {
    dealId: deal.id,
    orgName: deal.orgName,
    leadEmail: deal.contactEmail,
    leadName: deal.contactName,
    repEmail: slot.repEmail,
    startIso: slot.startIso,
    endIso: slot.endIso,
    videoUrl,
    label: formatSlot(slot.startIso, opts.tzOffsetMinutes, tzLabel),
    rescheduled: wasBooked,
  }).catch(() => {});

  return { ok: true, startIso: slot.startIso, label: formatSlot(slot.startIso, opts.tzOffsetMinutes, tzLabel), repEmail: slot.repEmail };
}

/** Cancel the booked call; the lead can re-book with the same link. */
export async function cancelDiscoveryCall(token: string) {
  const deal = await loadDealByToken(token);
  if (!deal.discoveryCallAt) return { ok: true, alreadyCancelled: true };
  await db.deal.update({
    where: { id: deal.id },
    data: { discoveryCallStatus: "cancelled", discoveryCallAt: null, discoveryCallEndAt: null, stage: "new", lastContactAt: new Date() },
  });
  await logActivity({ source: "sales", eventType: "discovery_call_cancelled", severity: "warning", summary: `${deal.orgName}: discovery call cancelled` });
  const settings = await loadSettings();
  const from = str(settings, "system_email_from");
  const to = [deal.contactEmail, deal.discoveryRepEmail].filter(Boolean) as string[];
  if (from && to.length) {
    await sendSystemEmail({
      from, to,
      subject: `Discovery call cancelled — ${deal.orgName}`,
      body: `The discovery call for ${deal.orgName} has been cancelled.\n\nYou can pick a new time any time using your booking link.`,
    }).catch(() => {});
  }
  return { ok: true };
}

async function sendBookingEmails(
  settings: Map<string, string>,
  b: {
    dealId: string; orgName: string; leadEmail: string | null; leadName: string | null;
    repEmail: string; startIso: string; endIso: string; videoUrl: string | null;
    label: string; rescheduled: boolean;
  },
) {
  const from = str(settings, "system_email_from");
  if (!from) return;
  const company = str(settings, "company_name", "Pure Water Automations");
  const ics = buildIcs({
    uid: `discovery-${b.dealId}@pwa`,
    startIso: b.startIso,
    endIso: b.endIso,
    summary: `Discovery call — ${company} × ${b.orgName}`,
    description: `A free 30-minute discovery call.${b.videoUrl ? ` Join: ${b.videoUrl}` : ""}`,
    organizerEmail: b.repEmail,
    attendeeEmail: b.leadEmail || b.repEmail,
    location: b.videoUrl || undefined,
    dtstampIso: new Date().toISOString(),
  });
  const attachments = [{ filename: "discovery-call.ics", content: Buffer.from(ics, "utf8"), mimeType: "text/calendar; method=REQUEST" }];
  const verb = b.rescheduled ? "rescheduled" : "confirmed";

  if (b.leadEmail) {
    await sendSystemEmail({
      from, to: b.leadEmail, attachments,
      subject: `Your discovery call is ${verb} — ${b.label}`,
      body:
        `Hi${b.leadName ? ` ${b.leadName}` : ""},\n\n` +
        `Your free discovery call with ${company} is ${verb}:\n\n` +
        `  ${b.label}\n` +
        (b.videoUrl ? `  Join here: ${b.videoUrl}\n` : "") +
        `\nWe've attached a calendar invite. See you then!\n\n— ${company}`,
    });
  }
  // Notify the assigned rep too (they get the invite on their calendar).
  await sendSystemEmail({
    from, to: b.repEmail, attachments,
    subject: `Discovery call ${verb}: ${b.orgName} — ${b.label}`,
    body: `${b.orgName} ${b.rescheduled ? "moved" : "booked"} a discovery call.\n\n  ${b.label}\n  Lead: ${b.leadName ?? b.leadEmail ?? "—"}\n${b.videoUrl ? `  Join: ${b.videoUrl}\n` : ""}`,
  });
}
