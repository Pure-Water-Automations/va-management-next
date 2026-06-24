import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getEffectiveActor } from "@/lib/auth/access";
import { canManageProjects } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { ProjectForm } from "@/components/ProjectForm";
import { getClients } from "@/lib/reads/clients";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  const actor = await getEffectiveActor(user);
  if (!actor.isAdmin && !canManageProjects(actor.role)) {
    redirect("/hr/projects");
  }

  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const clients = await getClients();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/hr/projects">Projects</Link> / New
          </div>
          <h1>New Project</h1>
        </div>
      </div>

      <ProjectForm users={users} clients={clients} />
    </>
  );
}
