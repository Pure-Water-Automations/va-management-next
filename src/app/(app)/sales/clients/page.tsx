import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadClientAccounts } from "@/lib/reads/sales-console";
import { ClientAccountsClient } from "@/components/sales/ClientAccountsClient";

export const dynamic = "force-dynamic";

// Sales — Client accounts: the relationship after the win.
// `?account=<id>` deep-links straight into that client's drawer.
export default async function SalesClientAccountsPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  await requireSalesUser();
  const { account } = await searchParams;
  const accounts = await loadClientAccounts();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Sales</div>
          <h1>Client accounts</h1>
          <p className="small">
            The relationship after the win — keep every client warm, watch hours against their package,
            and grow them to the next tier when the signals say so.
          </p>
        </div>
      </div>
      <ClientAccountsClient accounts={accounts} openAccountId={account ?? null} />
    </>
  );
}
