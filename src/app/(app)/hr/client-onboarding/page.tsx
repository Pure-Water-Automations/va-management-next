import { redirect } from "next/navigation";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { ClientOnboardingBoard, type OnboardingRow } from "@/components/ClientOnboardingBoard";

export const dynamic = "force-dynamic";

export default async function HrClientOnboardingPage() {
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !isAllAccess(user)) redirect("/hr");

  const records = await db.clientOnboarding.findMany({
    orderBy: { createdAt: "desc" },
    include: { clientOrganization: { select: { id: true, name: true, status: true } } },
  });

  const rows: OnboardingRow[] = records.map((r) => ({
    orgId: r.clientOrganizationId,
    orgName: r.clientOrganization.name,
    orgStatus: r.clientOrganization.status,
    status: r.status,
    owner: r.owner,
    intakeReceived: r.intakeReceived,
    onboardingCallBooked: r.onboardingCallBooked,
    onboardingCallDone: r.onboardingCallDone,
    driveFolderCreated: r.driveFolderCreated,
    portalAccessGranted: r.portalAccessGranted,
    commsCadenceSet: r.commsCadenceSet,
    firstWeekPriorities: r.firstWeekPriorities,
    vaAssigned: r.vaAssigned,
    kickoffRecapSent: r.kickoffRecapSent,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Clients</div>
          <h1>Client onboarding</h1>
          <p className="small">Created automatically when a deal is signed &amp; paid. Complete the checklist to grant portal access and set the org Active.</p>
        </div>
      </div>
      <ClientOnboardingBoard rows={rows} />
    </>
  );
}
