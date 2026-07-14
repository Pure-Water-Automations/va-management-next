import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { loadSettings, str } from "@/lib/settings";
import { Card } from "@/components/ui/Card";
import { WhatsAppSettingsForm } from "@/components/WhatsAppSettingsForm";

export const dynamic = "force-dynamic";

export default async function WhatsAppAdminPage() {
  const user = await getCurrentUser();
  if (!isAllAccess(user)) redirect("/");

  const s = await loadSettings();
  const phoneNumberId = str(s, "whatsapp_phone_number_id", "");
  const configured = !!str(s, "whatsapp_access_token", "") && !!phoneNumberId;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin · Settings</div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            WhatsApp notifications
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#fff", background: "var(--color-sky-500, #2b8fd6)", padding: "2px 6px", borderRadius: 5 }}>
              Beta
            </span>
          </h1>
        </div>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <p className="small" style={{ margin: 0 }}>
          Connect a WhatsApp Business (Meta Cloud API) number so VAs can get task notifications on WhatsApp in addition to (or
          instead of) email. Per-VA channel + number are set in <strong>Manage → VA Registry</strong> (the <em>Notify</em> column).
          Until this is configured, everything falls back to email.
        </p>
      </Card>

      <Card>
        <WhatsAppSettingsForm
          configured={configured}
          phoneNumberId={phoneNumberId}
          templateName={str(s, "whatsapp_template_name", "")}
          templateLang={str(s, "whatsapp_template_lang", "en_US")}
          apiVersion={str(s, "whatsapp_api_version", "v21.0")}
        />
      </Card>
    </>
  );
}
