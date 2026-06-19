import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { UserManagement } from "@/components/UserManagement";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user.isAdmin) redirect("/");

  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, isAdmin: true, active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }, { email: "asc" }],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin · Settings</div>
          <h1>Users</h1>
        </div>
      </div>

      <Card style={{ marginBottom: 8 }}>
        <p className="small" style={{ margin: 0 }}>
          Users must have a matching Google account to sign in. Click a name to edit it inline.
          Role changes and status toggles take effect immediately.
        </p>
      </Card>

      <Card>
        <UserManagement users={users} />
      </Card>
    </>
  );
}
