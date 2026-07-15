import { NextResponse, type NextRequest } from "next/server";

// Sales-console mode (CONSOLE_MODE="sales"): this deployment is the
// sales/marketing/client test environment, so the HR / Payroll / Recruitment /
// VA / Recordings / Meeting-actions surfaces are disabled outright — any hit
// on them bounces to the Sales console. The matcher keeps the middleware off
// every other route (public funnel, client portal, APIs, assets).
const DISABLED_IN_SALES_MODE =
  /^\/(hr|payroll|recruitment|va|meeting-actions|record|recordings|apply)(\/|$)/;

export function middleware(req: NextRequest) {
  if (process.env.CONSOLE_MODE === "sales" && DISABLED_IN_SALES_MODE.test(req.nextUrl.pathname)) {
    // Behind the Cloudflare tunnel, the raw Host header is the local origin
    // (e.g. localhost:8785), not the public hostname — req.url's origin would
    // redirect the browser off-box. Use the forwarded host/proto instead.
    const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, "");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    return NextResponse.redirect(new URL("/sales", `${proto}://${host}`));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/hr/:path*",
    "/payroll/:path*",
    "/recruitment/:path*",
    "/va/:path*",
    "/meeting-actions/:path*",
    "/record/:path*",
    "/recordings/:path*",
    "/apply/:path*",
  ],
};
