import { db } from "@/lib/db";

export type ScratchRow = {
  id: string;
  text: string;
  promotedTaskId: string | null;
  fromClient: boolean;
  createdAt: Date;
};

export async function getScratchItems(projectId: string): Promise<ScratchRow[]> {
  const items = await db.scratchItem.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return items.map((i) => ({
    id: i.id,
    text: i.text,
    promotedTaskId: i.promotedTaskId,
    fromClient: i.clientTaskRequestId !== null,
    createdAt: i.createdAt,
  }));
}
