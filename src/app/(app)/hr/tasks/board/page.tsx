import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveActor } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getAllTasks } from "@/lib/reads/tasks";
import { TaskViewTabs } from "@/components/TaskViewTabs";
import { TaskBoard } from "@/components/TaskBoard";

export const dynamic = "force-dynamic";

export default async function HrTaskBoardPage() {
  const user = await getCurrentUser();
  const actor = await getEffectiveActor(user);
  if (!actor.isAdmin && !canManageTasks(actor.role)) redirect("/hr/tasks");

  const tasks = await getAllTasks({});

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb"><Link href="/hr/tasks">All Tasks</Link> / Board</div>
          <h1>Task Board</h1>
        </div>
      </div>

      <TaskViewTabs current="board" />

      <TaskBoard tasks={tasks} />
    </>
  );
}
