"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { issueAuthCode } from "@/lib/oauth/tokens";

const Params = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  state: z.string().optional().default(""),
  code_challenge: z.string().min(20),
  decision: z.enum(["approve", "deny"]),
});

export async function decideAuthorization(formData: FormData) {
  const user = await getCurrentUser(); // redirects to /login when signed out
  const p = Params.parse(Object.fromEntries(formData));

  const client = await db.oAuthClient.findUnique({ where: { id: p.client_id } });
  if (!client || !client.redirectUris.includes(p.redirect_uri)) throw new Error("Unknown client or redirect URI");

  const url = new URL(p.redirect_uri);
  if (p.decision === "deny") {
    url.searchParams.set("error", "access_denied");
    if (p.state) url.searchParams.set("state", p.state);
    redirect(url.toString());
  }
  const code = await issueAuthCode({
    clientId: client.id,
    userId: user.id,
    redirectUri: p.redirect_uri,
    codeChallenge: p.code_challenge,
  });
  url.searchParams.set("code", code);
  if (p.state) url.searchParams.set("state", p.state);
  redirect(url.toString());
}
