import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Forwards the request path to server components via a header — the App Router has
// no other way to read the current pathname outside a client component. Used by
// (app)/layout.tsx to log page-view analytics.
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
