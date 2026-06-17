import { db } from "@/lib/db";

export async function getSavedViews(userId: string, scope = "tasks") {
  return db.savedView.findMany({
    where: { userId, scope },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, query: true },
  });
}

export type SavedViewItem = Awaited<ReturnType<typeof getSavedViews>>[number];
