import { db } from "@/lib/db";
import type { CfoSnapshotPayload } from "@/lib/cfo/types";

export type LatestCfoSnapshot = {
  id: string;
  createdAt: Date;
  computedAt: Date;
  hasNarrative: boolean;
  payload: CfoSnapshotPayload;
} | null;

/** Latest pushed CFO snapshot, or null if none pushed yet. */
export async function getLatestCfoSnapshot(): Promise<LatestCfoSnapshot> {
  const row = await db.cfoSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.createdAt,
    computedAt: row.computedAt,
    hasNarrative: row.hasNarrative,
    payload: row.payload as unknown as CfoSnapshotPayload,
  };
}
