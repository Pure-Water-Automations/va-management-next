import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async ({ body }) => {
      const { id } = await params;
      const reason = str(body, "reason");
      if (reason.length > 500) throw new Error("Reason must be 500 characters or fewer");

      const existing = await db.clientTaskRequest.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!existing) throw new Error("Request not found");
      if (existing.status === "DECLINED" || existing.status === "ASSIGNED") {
        throw new Error("Request cannot be declined in its current state");
      }

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
