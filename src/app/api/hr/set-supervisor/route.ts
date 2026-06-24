import { action, str, optStr } from "@/lib/api";
import { setVaSupervisor } from "@/lib/actions/team";

// Set (or clear) a VA's supervisor. Body: { vaId, supervisorVaId? }. HR-gated.
export const POST = action(async ({ user, body }) =>
  setVaSupervisor({ role: user.role, isAdmin: user.isAdmin }, str(body, "vaId"), optStr(body, "supervisorVaId") ?? null),
);
