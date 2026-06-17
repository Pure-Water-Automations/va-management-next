import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageProjects } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { ProjectForm } from "@/components/ProjectForm";
import { getClients } from "@/lib/reads/clients";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageProjects(user.role)) {
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
            <a href="/hr/projects">Projects</a> / New
          </div>
          <h1>New Project</h1>
        </div>
      </div>

      <ProjectForm users={users} clients={clients} />
    </>
  );
}
