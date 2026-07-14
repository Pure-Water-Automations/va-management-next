/**
 * Pure notification-channel logic (no DB / no network), unit-tested.
 * Decides which channels a task notification should go out on, and normalizes
 * a phone number to a storable E.164-ish form.
 */
import type { NotifyChannel } from "@prisma/client";

/**
 * Given a VA's preference, whether they have a WhatsApp number on file, and
 * whether the WhatsApp Business API is configured at all, decide the channels.
 * WhatsApp only fires when the VA opted in (both|whatsapp) AND has a number AND
 * the integration is live — otherwise it silently falls back to email.
 * "none" and "digest" get no immediate channel — digest VAs instead receive the
 * once-a-day notification-digest email (worker/notification-digest.ts).
 */
export function channelDecision(
  channel: NotifyChannel | null | undefined,
  hasWhatsappNumber: boolean,
  whatsappConfigured: boolean,
): { email: boolean; whatsapp: boolean } {
  const ch = channel ?? "both";
  const email = ch === "both" || ch === "email";
  const whatsapp = (ch === "both" || ch === "whatsapp") && hasWhatsappNumber && whatsappConfigured;
  return { email, whatsapp };
}

/** Normalize to "+<digits>" for storage/display; returns null if implausible. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null; // E.164 is 8–15 digits
  return `+${digits}`;
}

/** Strip to bare digits for the Meta Cloud API `to` field. */
export function toApiNumber(stored: string | null | undefined): string {
  return (stored ?? "").replace(/[^\d]/g, "");
}
