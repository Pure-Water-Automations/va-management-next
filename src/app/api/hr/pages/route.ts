import { action, str, optStr } from "@/lib/api";
import { createPage } from "@/lib/actions/pages";
import type { PageScope } from "@prisma/client";

export const POST = action(async ({ user, body }) =>
  createPage(user.id, user.role, {
    scope: (optStr(body, "scope") === "LIBRARY" ? "LIBRARY" : "PROJECT") as PageScope,
    projectId: optStr(body, "projectId"),
    parentId: optStr(body, "parentId"),
    title: str(body, "title"),
  }),
);
