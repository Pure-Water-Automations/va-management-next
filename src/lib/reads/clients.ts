import { db } from "@/lib/db";

/** Active client names (synced one-way from Notion) for the client dropdown. */
export async function getClients(): Promise<string[]> {
  const rows = await db.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  return rows.map((r) => r.name);
}
