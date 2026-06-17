import { action, optStr } from "@/lib/api";
import { listVisibleRecordings } from "@/lib/reads/recordings";

export const POST = action(
  async ({ user, body }) =>
    listVisibleRecordings(user, {
      scope: optStr(body, "scope") as "mine" | "all" | undefined,
      project: optStr(body, "project"),
      status: optStr(body, "status"),
    }),
  { allow: () => false },
);
