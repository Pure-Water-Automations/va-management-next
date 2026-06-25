import { getCurrentUser, getEffectiveVaId } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { CheckinForm } from "@/components/CheckinForm";

export const dynamic = "force-dynamic";

export default async function VaCheckinPage() {
  const user = await getCurrentUser();
  const vaId = await getEffectiveVaId(user);
  if (!vaId) {
    return (
      <div className="page-head"><div><h1>Monthly check-in</h1><p className="small">Your login isn’t linked to a VA record.</p></div></div>
    );
  }
  const va = await db.va.findUnique({ where: { vaId } });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">My Console</div>
          <h1>Monthly check-in</h1>
        </div>
      </div>
      <Card tourEl="/va/checkin">
        <p className="small" style={{ marginTop: 0, marginBottom: 18 }}>
          A quick monthly pulse — your target hours, availability, and how your workload feels.
        </p>
        <CheckinForm defaults={{ targetHoursWeekly: va?.targetHoursWeekly, availabilityNotes: va?.availabilityNotes, daysOff: va?.daysOff }} />
      </Card>
    </>
  );
}
