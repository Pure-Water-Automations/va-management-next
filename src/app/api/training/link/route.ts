import { generateLink } from "@/lib/actions/training";
import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export const POST = action(
  async ({ body }) => generateLink(str(body, "candidateId"), bool(body.rotate)),
  { allow: isGateReviewer },
);
