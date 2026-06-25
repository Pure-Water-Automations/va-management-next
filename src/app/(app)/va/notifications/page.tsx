import { getCurrentUser, getEffectiveVaId } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { NotifyPrefsForm } from "@/components/NotifyPrefsForm";

export const dynamic = "force-dynamic";

export default async function VaNotificationsPage() {
  const user = await getCurrentUser();
  const vaId = await getEffectiveVaId(user);
  if (!vaId) {
    return (
      <div className="page-head"><div><h1>Notifications</h1><p className="small">Your login isn’t linked to a VA record.</p></div></div>
    );
  }
  const va = await db.va.findUnique({ where: { vaId }, select: { notifyTasks: true } });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">My Console</div>
          <h1>Notification preferences</h1>
        </div>
      </div>
      <Card>
        <p className="small" style={{ marginTop: 0, marginBottom: 18 }}>
          Choose how you’d like to hear about tasks assigned to you. The in-app bell always notifies you — this only controls email.
        </p>
        <NotifyPrefsForm current={va?.notifyTasks ?? "each"} />
      </Card>
    </>
  );
}
