import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async ({ body }) => {
      const { id } = await params;
      const reason = str(body, "reason");
      if (reason.length > 500) throw new Error("Reason must be 500 characters or fewer");

      const updated = await db.clientTaskRequest.update({
        where: { id },
        data: { status: "DECLINED", declineReason: reason },
        select: { id: true, status: true },
      });
      return updated;
    },
    { allow: (r) => isGateReviewer(r) },
  )(request);
}
