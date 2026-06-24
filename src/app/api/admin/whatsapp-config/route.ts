import { action } from "@/lib/api";
import { db } from "@/lib/db";

// Save WhatsApp Business API config into Settings. Admin-only (allow:()=>false →
// only isAdmin passes the wrapper). Body keys map to Setting rows.
export const POST = action(
  async ({ body }) => {
    const set = async (key: string, field: string, isSecret = false) => {
      if (!(field in body)) return;
      const value = String(body[field] ?? "").trim();
      if (isSecret && value === "") return; // blank token = keep current
      await db.setting.upsert({ where: { key }, update: { value, isSecret }, create: { key, value, isSecret } });
    };
    await set("whatsapp_access_token", "accessToken", true);
    await set("whatsapp_phone_number_id", "phoneNumberId");
    await set("whatsapp_template_name", "templateName");
    await set("whatsapp_template_lang", "templateLang");
    await set("whatsapp_api_version", "apiVersion");
    return { ok: true };
  },
  { allow: () => false },
);
