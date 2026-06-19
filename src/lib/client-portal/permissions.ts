import type { CommentVisibility } from "@prisma/client";

export function parseCommentVisibility(
  raw: string | undefined
): CommentVisibility {
  return raw === "CLIENT_VISIBLE" ? "CLIENT_VISIBLE" : "INTERNAL_ONLY";
}
