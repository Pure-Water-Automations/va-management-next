export const CLIENT_PORTAL_BASE = "/client";

export const clientPortalRoutes = {
  home: CLIENT_PORTAL_BASE,
  projects: `${CLIENT_PORTAL_BASE}/projects`,
  project: (projectId: string) => `${CLIENT_PORTAL_BASE}/projects/${projectId}`,
  newTask: `${CLIENT_PORTAL_BASE}/tasks/new`,
  task: (taskId: string) => `${CLIENT_PORTAL_BASE}/tasks/${taskId}`,
  files: `${CLIENT_PORTAL_BASE}/files`,
  reports: `${CLIENT_PORTAL_BASE}/reports`,
  settings: `${CLIENT_PORTAL_BASE}/settings`,
} as const;

export const clientPortalNav = [
  { label: "Dashboard", href: clientPortalRoutes.home },
  { label: "Projects", href: clientPortalRoutes.projects },
  { label: "Delegate", href: clientPortalRoutes.newTask },
  { label: "Files", href: clientPortalRoutes.files },
  { label: "Reports", href: clientPortalRoutes.reports },
] as const;

export function isClientPortalPath(pathname: string): boolean {
  return pathname === CLIENT_PORTAL_BASE || pathname.startsWith(`${CLIENT_PORTAL_BASE}/`);
}
