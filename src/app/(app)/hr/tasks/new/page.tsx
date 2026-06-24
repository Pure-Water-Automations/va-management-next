import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveActor } from "@/lib/auth/access";
import { canUserDelegateTasks } from "@/lib/auth/delegation";
import { getProjectsList } from "@/lib/reads/projects";
import { getDelegationAssignees } from "@/lib/reads/assignees";
import { getClients } from "@/lib/reads/clients";
import { readSopPicker, readTrainingPicker, readToolsPicker } from "@/lib/notion-picker";
import { Card } from "@/components/ui/Card";
import { DelegateTaskForm } from "@/components/DelegateTaskForm";

export const dynamic = "force-dynamic";

export default async function DelegateTaskPage() {
  const user = await getCurrentUser();
  const actor = await getEffectiveActor(user);
  if (!actor.isAdmin && !(await canUserDelegateTasks(actor.id, actor.role))) {
    redirect("/hr/tasks");
  }

  // Picker data: synchronous fs reads from the local Notion mirror.
  const sops = readSopPicker();
  const trainings = readTrainingPicker();
  const tools = readToolsPicker();
  const clients = await getClients();

  // Assignable VAs and optional project links from Postgres.
  const [assignees, projects] = await Promise.all([getDelegationAssignees(), getProjectsList()]);

  const projectOptions = projects
    .filter((p) => p.status !== "Done")
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/hr/tasks">All Tasks</Link> / Delegate
          </div>
          <h1>Delegate a Task</h1>
        </div>
      </div>

      <Card padding={32} style={{ maxWidth: 640 }}>
        <DelegateTaskForm
          vas={assignees}
          projects={projectOptions}
          sops={sops}
          trainings={trainings}
          tools={tools}
          clients={clients}
        />
      </Card>
    </>
  );
}
