import { redirect } from "next/navigation";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { isSalesRep } from "@/lib/auth/roles";
import { loadSalesRows } from "@/lib/reads/sales";
import { loadSettings } from "@/lib/settings";
import { SalesBoard } from "@/components/SalesBoard";

export const dynamic = "force-dynamic";

// The dedicated Sales console — the SALES role's home, also open to HR/admin.
export default async function SalesConsole() {
  const user = await getCurrentUser();
  // Admit all-access users (admins AND the QA `TESTER` role). The root router sends
  // any all-access user who switched to the Sales view here via the `va_view` cookie,
  // so guarding on `!user.isAdmin` alone bounced a TESTER back to / — the same
  // infinite redirect loop the /hr guard had. Use isAllAccess to match the router.
  if (!isSalesRep(user.role) && !isAllAccess(user)) redirect("/");

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
      <SalesBoard deals={rows} canFinance={canFinance} testimonials={testimonials} />
    </>
  );
}
