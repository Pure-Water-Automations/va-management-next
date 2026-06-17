import { action } from "@/lib/api";
import { db } from "@/lib/db";
import { sendSystemEmail } from "@/lib/email";

// Admin-only: sends a test email to the signed-in admin's own address to verify
// the connected sender works end to end. `allow: () => false` means only
// isAdmin users pass (admins bypass the role guard in `action`).
export const POST = action(
  async ({ user }) => {
    const fromRow = await db.setting.findUnique({ where: { key: "system_email_from" } });
    const from = (fromRow?.value || "").trim();
    if (!from) throw new Error("No 'from' address set (system_email_from).");

    const res = await sendSystemEmail({
      from,
      to: user.email,
      subject: "PWA VA Management — test email ✅",
      body: `This is a test from the VA Management console.\n\nIf you're reading this, sending from ${from} works. Alerts, reminders, and applicant notifications will go out from this address.\n\n— Purii`,
    });
    if (!res.ok) throw new Error(`Send skipped: ${res.reason}`);
    return { sent: user.email, from, id: res.id };
  },
  { allow: () => false },
);
