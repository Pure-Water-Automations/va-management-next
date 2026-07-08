import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadSalesRows } from "@/lib/reads/sales";
import { loadSettings } from "@/lib/settings";
import { SalesBoard } from "@/components/SalesBoard";

export const dynamic = "force-dynamic";

// The dedicated Sales console — the SALES role's home, also open to HR/admin.
// `?deal=<id>` deep-links straight into that deal's drawer.
export default async function SalesConsole({ searchParams }: { searchParams: Promise<{ deal?: string }> }) {
  const user = await requireSalesUser();
  const { deal } = await searchParams;

  const rows = await loadSalesRows();
  const canFinance = user.isAdmin || user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS";
  const settings = await loadSettings();
  const testimonials = settings.get("discovery_testimonials") || null;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Sales</div>
          <h1>Sales pipeline</h1>
          <p className="small">
            The full client funnel — from a public discovery lead (auto-scored Hot / Warm / Cold) through the
            discovery call, proposal, signature, and onboarding. New leads arrive from the public
            <strong> /discover</strong> form; book and run the call here, then send the agreement and convert to a client.
          </p>
        </div>
      </div>
      <SalesBoard deals={rows} canFinance={canFinance} testimonials={testimonials} openDealId={deal ?? null} />
    </>
  );
}
