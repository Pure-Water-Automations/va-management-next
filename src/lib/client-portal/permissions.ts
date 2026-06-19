import type { CommentVisibility } from "@prisma/client";

export type CommentMeta = {
  visibility: CommentVisibility;
  visibilityLabel: string;
};

export function parseCommentVisibility(
  raw: string | undefined
): CommentVisibility {
  return raw === "CLIENT_VISIBLE" ? "CLIENT_VISIBLE" : "INTERNAL_ONLY";
}
