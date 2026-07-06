import { redirect } from "next/navigation";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { DEFAULT_CLIENT_AGREEMENT_TEMPLATE_HTML } from "@/lib/sales/client-template";
import { AgreementTemplateEditor } from "@/components/AgreementTemplateEditor";

export const dynamic = "force-dynamic";

export default async function ClientAgreementTemplatePage() {
  const user = await getCurrentUser();
  if (!isAllAccess(user)) redirect("/");
  const row = await db.setting.findUnique({ where: { key: "client_agreement_template_html" } });
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin</div>
          <h1>Client agreement template</h1>
        </div>
      </div>
      <AgreementTemplateEditor
        initial={row?.value || DEFAULT_CLIENT_AGREEMENT_TEMPLATE_HTML}
        endpoint="/api/admin/client-agreement-template"
        tokens={"{{client}} {{contact}} {{package}} {{price}} {{billing}} {{start_date}} {{date}} {{deadline}} {{company}}"}
      />
    </>
  );
}
