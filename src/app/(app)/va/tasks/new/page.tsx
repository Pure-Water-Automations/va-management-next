import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/access";
import { Card } from "@/components/ui/Card";
import { VaNewTaskForm } from "@/components/VaNewTaskForm";

export const dynamic = "force-dynamic";

export default async function VaNewTaskPage() {
  // Any VA in the app may self-create a task; the API enforces VA/SENIOR_VA +
  // self-assignment, so no extra gating is needed here.
  await getCurrentUser();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/va/tasks">My Tasks</Link> / New
          </div>
          <h1>New task</h1>
        </div>
      </div>

      <Card padding={32} style={{ maxWidth: 640 }}>
        <VaNewTaskForm />
      </Card>
    </>
  );
}
