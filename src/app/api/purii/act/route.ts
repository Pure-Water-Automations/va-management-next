import { action, str } from "@/lib/api";
import { bypassAct } from "@/lib/purii";

// Permission Bypass — admin only (allow:()=>false + the wrapper's admin bypass).
// Returns either an answer or a proposed action awaiting confirmation.
export const POST = action(async ({ actor, body }) => bypassAct(str(body, "question"), actor.role), {
  allow: () => false,
});
