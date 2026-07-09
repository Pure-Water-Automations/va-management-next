import type { Role } from "@prisma/client";
import { action, optStr, str } from "@/lib/api";
import { db } from "@/lib/db";

const allow = (role: Role) => role === "BOOKKEEPER" || role === "HR_MANAGER" || role === "PEOPLE_OPS";

export const POST = action(
  async ({ body, user }) => {
    const op = str(body, "op");
    const project = str(body, "project");

    if (op === "map") {
      const clientOrgId = optStr(body, "clientOrgId") || null;
      return db.clientProjectMap.upsert({
        where: { project },
        update: { clientOrgId, createdByEmail: user.email },
        create: { project, clientOrgId, createdByEmail: user.email },
      });
    }

    if (op === "unmap") {
      await db.clientProjectMap.delete({ where: { project } });
      return { ok: true };
    }

    throw new Error(`Unknown op: ${op}`);
  },
  { allow },
);
