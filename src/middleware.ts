import { NextResponse, type NextRequest } from "next/server";

/**
 * Hub-only isolation gate. When HUB_ONLY_MODE is on (dev-projects.pwasecondbrain.uk),
 * this deployment is stripped to just the Projects/Tasks Hub for an isolated team
 * review: any console page outside the Hub surface redirects to /hr/projects. Off
 * everywhere else (default), so main/prod are untouched — the middleware no-ops.
 *
 * Read process.env directly (not the zod `env`) — middleware bundles separately and
 * shouldn't drag the whole server env schema in. Same truthy parse as env.ts.
 */
const HUB_ONLY = ["1", "true", "yes", "on"].includes(
  (process.env.HUB_ONLY_MODE ?? "").trim().toLowerCase(),
);

// The Hub surface + auth/client routes that stay reachable in hub-only mode.
// (/api, /_next, and static files are excluded by the matcher below, so API calls
// the Hub makes are never gated — only page navigations are.)
function isAllowed(pathname: string): boolean {
  return (
    pathname === "/hr/projects" ||
    pathname.startsWith("/hr/projects/") ||
    pathname === "/hr/tasks" ||
    pathname.startsWith("/hr/tasks/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/client") // client-portal view — testers use it in the Hub demo
  );
}

export function middleware(req: NextRequest) {
  if (!HUB_ONLY) return NextResponse.next();
  if (isAllowed(req.nextUrl.pathname)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/hr/projects";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API, Next internals, and any file with an extension (static assets).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
