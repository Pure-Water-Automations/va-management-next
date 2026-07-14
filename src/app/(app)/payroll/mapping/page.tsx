import { db } from "@/lib/db";
import { activeHoursSource } from "@/lib/services/hours-source";
import {
  ProjectMappingClient,
  type MappingOrg,
  type MappingProject,
} from "@/components/payroll/ProjectMappingClient";

export const dynamic = "force-dynamic";

export default async function PayrollMappingPage() {
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  const rows = await activeHoursSource().breakdown(since, new Date());
  const projectHours = new Map<string, number>();
  for (const row of rows) {
    if (row.project) {
      projectHours.set(row.project, (projectHours.get(row.project) ?? 0) + row.hours);
    }
  }

  const [maps, orgs] = await Promise.all([
    db.clientProjectMap.findMany({ select: { project: true, clientOrgId: true } }),
    db.clientOrganization.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const orgList: MappingOrg[] = orgs;
  const orgById = new Map(orgs.map((org) => [org.id, org.name]));
  const mapByProject = new Map(maps.map((map) => [map.project, map]));
  const projects: MappingProject[] = Array.from(projectHours.entries())
    .map(([project, hours]) => {
      const map = mapByProject.get(project);
      return {
        project,
        hours,
        mappedTo: map
          ? {
              clientOrgId: map.clientOrgId,
              clientOrgName: map.clientOrgId ? orgById.get(map.clientOrgId) ?? "Unknown client" : "Internal (PWA)",
            }
          : null,
      };
    })
    .sort((a, b) => b.hours - a.hours || a.project.localeCompare(b.project));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Payroll</div>
          <h1>Project → client mapping</h1>
          <p className="small" style={{ margin: "6px 0 0", maxWidth: 760, color: "var(--color-text-secondary)" }}>
            Every tracker project maps to a client (or Internal) so payroll hours are attributable. Unmapped projects can't feed the billing view.
          </p>
        </div>
      </div>

      <ProjectMappingClient projects={projects} orgs={orgList} />
    </>
  );
}
