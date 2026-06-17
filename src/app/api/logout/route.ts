import { redirect } from "next/navigation";

/**
 * Cloudflare Access owns the session in production, so "sign out" routes to its
 * logout endpoint. In dev (no Access in front) there's nothing to clear, so we
 * just bounce to the app root.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    redirect("/cdn-cgi/access/logout");
  }
  redirect("/");
}
