import { db } from "@/lib/db";

export type LinkedItem = {
  linkId: string;
  type: string;
  id: string;
  label: string;
  href: string;
  icon: string;
};

export type LinkOption = { type: string; id: string; label: string; icon: string };

const ICONS: Record<string, string> = {
  page: "📄",
  task: "✅",
  recording: "🎬",
  clientOrg: "🏢",
  project: "📁",
};

async function hrefFor(type: string, id: string): Promise<string> {
  switch (type) {
    case "page": {
      const p = await db.page.findUnique({ where: { id }, select: { scope: true, projectId: true } });
      if (!p) return "#";
      return p.scope === "LIBRARY" ? `/hr/library?page=${id}` : `/hr/projects/${p.projectId}?tab=page&page=${id}`;
    }
    case "task":
      return `/hr/tasks/${id}`;
    case "recording":
      return `/recordings/${id}`;
    case "clientOrg":
      return `/hr/clients`;
    case "project":
      return `/hr/projects/${id}`;
    default:
      return "#";
  }
}

/** Outgoing links + incoming backlinks for one entity, hrefs resolved. */
export async function getLinkedPanelData(fromType: string, fromId: string) {
  const [out, incoming] = await Promise.all([
    db.link.findMany({ where: { fromType, fromId }, orderBy: { createdAt: "asc" } }),
    db.link.findMany({ where: { toType: fromType, toId: fromId }, orderBy: { createdAt: "asc" } }),
  ]);

  const links: LinkedItem[] = [];
  for (const l of out) {
    links.push({
      linkId: l.id,
      type: l.toType,
      id: l.toId,
      label: l.label,
      href: await hrefFor(l.toType, l.toId),
      icon: ICONS[l.toType] ?? "🔗",
    });
  }

  // Backlinks: resolve the FROM side's current display label live.
  const backlinks: LinkedItem[] = [];
  for (const l of incoming) {
    let label = l.fromType;
    if (l.fromType === "project") {
      label = (await db.project.findUnique({ where: { id: l.fromId }, select: { name: true } }))?.name ?? "(deleted project)";
    } else if (l.fromType === "page") {
      label = (await db.page.findUnique({ where: { id: l.fromId }, select: { title: true } }))?.title ?? "(deleted page)";
    } else if (l.fromType === "task") {
      label = (await db.task.findUnique({ where: { id: l.fromId }, select: { title: true } }))?.title ?? "(deleted task)";
    }
    backlinks.push({
      linkId: l.id,
      type: l.fromType,
      id: l.fromId,
      label,
      href: await hrefFor(l.fromType, l.fromId),
      icon: ICONS[l.fromType] ?? "↩",
    });
  }

  return { links, backlinks };
}

/** "+ Link anything" candidates for a project hub, minus already-linked targets. */
export async function getLinkOptions(projectId: string): Promise<LinkOption[]> {
  const [pages, tasks, recordings, orgs, existing] = await Promise.all([
    db.page.findMany({
      where: { scope: "LIBRARY" },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 15,
    }),
    db.task.findMany({
      where: { projectId },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 15,
    }),
    db.recording
      .findMany({ select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 10 })
      .catch(() => [] as { id: string; title: string | null }[]),
    db.clientOrganization.findMany({ select: { id: true, name: true }, take: 10 }),
    db.link.findMany({ where: { fromType: "project", fromId: projectId }, select: { toType: true, toId: true } }),
  ]);

  const used = new Set(existing.map((l) => `${l.toType}:${l.toId}`));
  const opts: LinkOption[] = [
    ...pages.map((p) => ({ type: "page", id: p.id, label: p.title, icon: ICONS.page })),
    ...tasks.map((t) => ({ type: "task", id: t.id, label: t.title, icon: ICONS.task })),
    ...recordings.map((r) => ({ type: "recording", id: r.id, label: r.title ?? "Recording", icon: ICONS.recording })),
    ...orgs.map((o) => ({ type: "clientOrg", id: o.id, label: o.name, icon: ICONS.clientOrg })),
  ];
  return opts.filter((o) => !used.has(`${o.type}:${o.id}`));
}
