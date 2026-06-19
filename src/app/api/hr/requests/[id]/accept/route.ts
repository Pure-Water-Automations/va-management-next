import { action } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async () => {
      const { id } = await params;
      const existing = await db.clientTaskRequest.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!existing) throw new Error("Request not found");
      if (existing.status !== "RECEIVED" && existing.status !== "TRIAGE_NEEDED") {
        throw new Error("Request cannot be accepted in its current state");
      }
      const updated = await db.clientTaskRequest.update({
        where: { id },
        data: { status: "READY_TO_ASSIGN" },
        select: { id: true, status: true },
      });
      return updated;
    },
    { allow: (r) => isGateReviewer(r) },
  )(request);
}
