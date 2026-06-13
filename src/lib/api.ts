import type { Role } from "@prisma/client";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/access";
import { AuthorizationError } from "@/lib/auth/roles";
import { audit } from "@/lib/activity";

type Handler = (ctx: { user: CurrentUser; body: Record<string, unknown> }) => Promise<unknown>;

/**
 * Wrap a POST route handler: resolves the Cloudflare-Access identity, optionally
 * enforces a role predicate, parses JSON, audits the call, and normalizes errors.
 */
export function action(handler: Handler, opts?: { allow?: (role: Role) => boolean }) {
  return async (request: Request): Promise<Response> => {
    let user: CurrentUser;
    try {
      user = await getCurrentUser();
    } catch {
      return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    if (opts?.allow && !opts.allow(user.role)) {
      await audit({ actorEmail: user.email, action: "denied", ok: false });
      return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    try {
      const raw = await request.text();
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    try {
      const result = await handler({ user, body });
      await audit({ actorEmail: user.email, action: "action", ok: true });
      return Response.json({ ok: true, result: result ?? null });
    } catch (err) {
      const status = err instanceof AuthorizationError ? 403 : 400;
      const message = err instanceof Error ? err.message : "Action failed";
      await audit({ actorEmail: user.email, action: "action", ok: false, details: { message } });
      return Response.json({ ok: false, error: message }, { status });
    }
  };
}

export function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || v.trim() === "") throw new Error(`Missing field: ${key}`);
  return v;
}
export function optStr(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}
export function optNum(body: Record<string, unknown>, key: string): number | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
