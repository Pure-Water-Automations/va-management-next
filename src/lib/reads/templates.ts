import { db } from "@/lib/db";

export type TemplatesData = Awaited<ReturnType<typeof getTemplates>>;
export type ProjectTemplateItem = TemplatesData["projectTemplates"][number];
export type TaskTemplateItem = TemplatesData["taskTemplates"][number];

export async function getTemplates() {
  const [projectTemplates, taskTemplates] = await Promise.all([
    db.projectTemplate.findMany({ orderBy: { createdAt: "desc" } }),
    db.taskTemplate.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return { projectTemplates, taskTemplates };
}
