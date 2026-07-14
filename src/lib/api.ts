import type { Role } from "@prisma/client";
import { getCurrentUser, getEffectiveActor, isAllAccess, type CurrentUser, type EffectiveActor } from "@/lib/auth/access";
import { AuthorizationError } from "@/lib/auth/roles";
import { audit } from "@/lib/activity";
import { runWithActor } from "@/lib/request-context";
import { env } from "@/lib/env";

// `user` = the real logged-in principal (always; used for audit/accountability).
// `actor` = the EFFECTIVE principal capability checks run against: identical to
// `user`, EXCEPT when an admin is impersonating a VA ("View as → as VA"), where it
// is the impersonated VA (isAdmin=false, their role). Capability-bearing writes
// should use `actor`; activity/audit attribution stays on the real `user`.
type Handler = (ctx: { user: CurrentUser; actor: EffectiveActor; body: Record<string, unknown> }) => Promise<unknown>;

/**
 * Wrap a POST route handler: resolves the login identity, optionally enforces an
 * authorization predicate, parses JSON, audits the call, and normalizes errors.
 *
 * `allow` gates by role (specialized-function routes). `allowUser` gates by the
 * precomputed capability set (tier-driven delegation routes, e.g. `(u) => u.caps.manageTasks`).
 * All-access users (admin / Tester) bypass both.
 */
export function action(
  handler: Handler,
  opts?: { allow?: (role: Role) => boolean; allowUser?: (user: CurrentUser) => boolean },
) {
  return async (request: Request): Promise<Response> => {
    let user: CurrentUser;
    try {
      user = await getCurrentUser();
    } catch {
      return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    const actor = await getEffectiveActor(user);

    // Authorize against the EFFECTIVE actor. All-access (admin / Tester) bypasses
    // role guards so they can test every console's actions (actor === user). But
    // while an admin is impersonating a VA, actor.isAdmin is false and actor.role
    // is that VA's (never "TESTER" — impersonation only ever produces a VA actor),
    // so isAllAccess(actor) is false and an admin "as Hyunjin" is denied exactly
    // what Hyunjin would be — including routes guarded by `allow: () => false`
    // (Purii bypass, manager-only writes). `allowUser` (capability-set gates, e.g.
    // tier-driven delegation routes) checks the real `user` — impersonation only
    // applies to the VA console, so it never interacts with these HR-console gates.
    if (!isAllAccess(actor)) {
      const roleOk = opts?.allow ? opts.allow(actor.role) : true;
      const userOk = opts?.allowUser ? opts.allowUser(user) : true;
      if (!roleOk || !userOk) {
        await audit({ actorEmail: user.email, action: "denied", ok: false });
        return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
      }
    }

    let body: Record<string, unknown> = {};
    try {
      const raw = await request.text();
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    try {
      const result = await runWithActor(user.email, () => handler({ user, actor, body }));
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

/**
 * Like `action()`, but for the staff screen-recorder write/management endpoints.
 * When the deployment sets RECORDINGS_ENABLED=false (the production/official
 * build), the recorder is excluded — these routes 404 for everyone, admins
 * included (plain `action({ allow: () => false })` would still let admins
 * through). The client "Video Updates" read/comment endpoints keep using plain
 * `action()` so clients can still view + comment on recordings shared with them.
 */
export function recordingsAction(handler: Handler, opts?: { allow?: (role: Role) => boolean }) {
  if (!env.RECORDINGS_ENABLED) {
    return async (): Promise<Response> =>
      Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return action(handler, opts);
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
