import { action, str, optStr } from "@/lib/api";
import { setVaNotifyPrefs } from "@/lib/actions/team";

// Set a VA's notification channel and/or WhatsApp number. HR-gated.
// Body: { vaId, notifyChannel?, whatsappNumber? }.
export const POST = action(async ({ user, body }) =>
  setVaNotifyPrefs({ role: user.role, isAdmin: user.isAdmin }, str(body, "vaId"), {
    notifyChannel: optStr(body, "notifyChannel"),
    whatsappNumber: "whatsappNumber" in body ? ((body.whatsappNumber as string | null) ?? "") : undefined,
  }),
);
