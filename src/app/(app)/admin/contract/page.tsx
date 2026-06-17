import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { DEFAULT_CONTRACT_TEMPLATE_HTML } from "@/lib/contract/seed-template";
import { ContractTemplateEditor } from "@/components/ContractTemplateEditor";

export const dynamic = "force-dynamic";

export default async function ContractTemplatePage() {
  const user = await getCurrentUser();
  if (!user.isAdmin) redirect("/");
  const row = await db.setting.findUnique({ where: { key: "contract_template_html" } });
  return (
    <>
      <div className="page-head"><div><div className="crumb">Admin</div><h1>Contract template</h1></div></div>
      <ContractTemplateEditor initial={row?.value || DEFAULT_CONTRACT_TEMPLATE_HTML} />
    </>
  );
}
