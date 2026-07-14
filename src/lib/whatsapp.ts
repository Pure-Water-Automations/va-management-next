/**
 * WhatsApp Business notifications (beta) — provider-agnostic send with a Meta
 * Cloud API implementation. Config lives in the Setting table (like the DeskLog
 * token / system_email_from) so it can be set in the admin UI without a redeploy.
 *
 * Best-effort + mock-safe: when the WhatsApp Business API isn't configured, sends
 * are a logged no-op (never throwing), so notifications silently fall back to email
 * until credentials are added. Swapping to Twilio/another BSP is a small change to
 * `sendWhatsApp` keyed off a `whatsapp_provider` setting.
 *
 * NOTE (production): business-initiated WhatsApp messages outside the 24-hour
 * customer-service window require an APPROVED message template. Set
 * `whatsapp_template_name` (+ `whatsapp_template_lang`) and we send a template;
 * otherwise we send plain text (fine for testing / inside the 24h window).
 */
import { loadSettings, str } from "@/lib/settings";
import { toApiNumber } from "@/lib/notify-channel";

export type WhatsAppConfig = {
  configured: boolean;
  provider: string;
  accessToken: string;
  phoneNumberId: string;
  templateName: string | null;
  templateLang: string;
  apiVersion: string;
};

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const s = await loadSettings();
  const accessToken = str(s, "whatsapp_access_token", "");
  const phoneNumberId = str(s, "whatsapp_phone_number_id", "");
  return {
    configured: !!accessToken && !!phoneNumberId,
    provider: str(s, "whatsapp_provider", "meta") || "meta",
    accessToken,
    phoneNumberId,
    templateName: str(s, "whatsapp_template_name", "") || null,
    templateLang: str(s, "whatsapp_template_lang", "en_US") || "en_US",
    apiVersion: str(s, "whatsapp_api_version", "v21.0") || "v21.0",
  };
}

export async function whatsappConfigured(): Promise<boolean> {
  return (await getWhatsAppConfig()).configured;
}

export type WhatsAppResult = { ok: boolean; id?: string; reason?: string; mock?: boolean };

/**
 * Send one WhatsApp message. `text` is used for plain-text sends and as the single
 * body parameter when a template is configured (override with `templateParams`).
 */
export async function sendWhatsApp(opts: {
  to: string;
  text: string;
  templateParams?: string[];
  cfg?: WhatsAppConfig;
}): Promise<WhatsAppResult> {
  try {
    const cfg = opts.cfg ?? (await getWhatsAppConfig());
    if (!cfg.configured) {
      console.warn(`[whatsapp] not configured — skipped (to ${opts.to})`);
      return { ok: false, reason: "WhatsApp not configured", mock: true };
    }
    const to = toApiNumber(opts.to);
    if (!to) return { ok: false, reason: "no recipient number" };

    const body = cfg.templateName
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: cfg.templateName,
            language: { code: cfg.templateLang },
            components: [
              {
                type: "body",
                parameters: (opts.templateParams ?? [opts.text]).map((t) => ({ type: "text", text: t })),
              },
            ],
          },
        }
      : { messaging_product: "whatsapp", to, type: "text", text: { body: opts.text } };

    const res = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string } }
      | null;
    if (!res.ok) {
      const reason = data?.error?.message || `HTTP ${res.status}`;
      console.warn(`[whatsapp] send failed to ${to}: ${reason}`);
      return { ok: false, reason };
    }
    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[whatsapp] send error: ${reason.split("\n")[0]}`);
    return { ok: false, reason: reason.split("\n")[0] };
  }
}
