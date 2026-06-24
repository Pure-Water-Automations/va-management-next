import { action, str, optStr } from "@/lib/api";
import { sendWhatsApp } from "@/lib/whatsapp";

// Send a test WhatsApp message. Admin-only. Body: { to, text? }.
export const POST = action(
  async ({ body }) => {
    const to = str(body, "to");
    const text = optStr(body, "text") ?? "✅ Test from the VA Manager — WhatsApp notifications are working.";
    const res = await sendWhatsApp({ to, text });
    if (!res.ok) throw new Error(res.reason || "Send failed");
    return { ok: true, id: res.id };
  },
  { allow: () => false },
);
