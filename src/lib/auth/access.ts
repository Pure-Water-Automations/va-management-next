import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEmailFromHeaders } from "@/lib/auth/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Resolve the signed-in user from the Cloudflare Access header (production) or
 * the DEV_AUTH_EMAIL fallback (local dev). Replaces the GAS `resolveRole()`
 * layer: identity is verified at the edge, the role lives on the User row.
 */
export async function getCurrentUser() {
  const requestHeaders = await headers();
  const cloudflareEmail = getEmailFromHeaders(requestHeaders);
  const fallbackEmail =
    process.env.NODE_ENV !== "production" ? env.DEV_AUTH_EMAIL : undefined;
  const email = cloudflareEmail ?? fallbackEmail;

  if (!email) {
    redirect("/api/health");
  }

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { va: true },
  });

  if (!user || !user.active) {
    throw new Error(`No active VA Management account for ${email}`);
  }

  return user;
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
