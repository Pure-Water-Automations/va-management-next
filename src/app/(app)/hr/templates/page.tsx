import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getTemplates } from "@/lib/reads/templates";
import { TemplateManager } from "@/components/TemplateManager";

export const dynamic = "force-dynamic";

export default async function HrTemplatesPage() {
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const { projectTemplates, taskTemplates } = await getTemplates();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Projects</div>
          <h1>Templates</h1>
        </div>
      </div>

      <TemplateManager projectTemplates={projectTemplates} taskTemplates={taskTemplates} />
    </>
  );
}
