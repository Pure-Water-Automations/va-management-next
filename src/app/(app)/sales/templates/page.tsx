import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadEmailTemplates } from "@/lib/reads/sales-console";
import { TemplatesClient } from "@/components/sales/TemplatesClient";

export const dynamic = "force-dynamic";

// Sales — Email templates: copy, personalize the [bracketed] fields, send.
export default async function SalesTemplatesPage() {
  await requireSalesUser();
  const templates = await loadEmailTemplates();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Sales</div>
          <h1>Email templates</h1>
          <p className="small">
            Copy, personalize the [bracketed] fields, send. One template for every moment in the client journey.
          </p>
        </div>
      </div>
      <TemplatesClient templates={templates} />
    </>
  );
}
