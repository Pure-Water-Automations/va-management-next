import { action } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async () => {
      const { id } = await params;
      const updated = await db.clientTaskRequest.update({
        where: { id },
        data: { status: "ACCEPTED" },
        select: { id: true, status: true },
      });
      return updated;
    },
    { allow: (r) => isGateReviewer(r) },
  )(request);
}
