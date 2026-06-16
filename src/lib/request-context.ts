import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context carrying the acting identity. Used by the email layer so
 * that, in test mode, system emails can be redirected to whoever triggered the
 * action (the logged-in console user, or the candidate signing a contract)
 * instead of a single fixed test inbox.
 */
type RequestContext = { actorEmail?: string };

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithActor<T>(actorEmail: string | undefined, fn: () => T): T {
  return storage.run({ actorEmail: actorEmail?.trim() || undefined }, fn);
}

export function currentActorEmail(): string | undefined {
  return storage.getStore()?.actorEmail;
}
