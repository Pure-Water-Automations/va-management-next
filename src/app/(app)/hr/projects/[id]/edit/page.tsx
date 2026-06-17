import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageProjects } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { ProjectForm } from "@/components/ProjectForm";
import { getClients } from "@/lib/reads/clients";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageProjects(user.role)) {
    redirect(`/hr/projects/${id}`);
  }

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      type: true,
      priority: true,
      client: true,
      ownerId: true,
      dueDate: true,
      links: true,
    },
  });

  if (!project) {
    return (
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href="/hr/projects">Projects</a> / Edit
          </div>
          <h1>Project not found</h1>
        </div>
      </div>
    );
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
            <a href="/hr/projects">Projects</a> / <a href={`/hr/projects/${project.id}`}>{project.name}</a> / Edit
          </div>
          <h1>Edit Project</h1>
        </div>
      </div>

      <ProjectForm
        users={users}
        clients={clients}
        project={{
          ...project,
          dueDate: project.dueDate ? project.dueDate.toISOString().slice(0, 10) : null,
        }}
      />
    </>
  );
}
