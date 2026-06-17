/**
 * One-way sync of the client list from the Notion "🧑🏻‍🦱 Clients" DB into the
 * app's `Client` table. Run on the VPS (NOTION_TOKEN is in shared/.env.production):
 *   set -a && . ../shared/.env.production && set +a && npx tsx scripts/sync-clients.ts
 *
 * Notion is the source of truth (for now). Clients no longer present (or "Ended")
 * are marked inactive, not deleted, so historical task/project client values stay valid.
 */
import { db } from "@/lib/db";

const DB_ID = "00947e977cbc4ea1ac3dca3ee826440f";
const TOKEN = process.env.NOTION_TOKEN;

type NotionPage = { id: string; properties?: Record<string, unknown> };

async function main() {
  if (!TOKEN) throw new Error("NOTION_TOKEN is not set");
  const seen = new Set<string>();
  let cursor: string | undefined;
  let synced = 0;

  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }),
    });
    if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { results?: NotionPage[]; has_more?: boolean; next_cursor?: string };

    for (const page of json.results ?? []) {
      const props = (page.properties ?? {}) as Record<string, { title?: { plain_text?: string }[]; status?: { name?: string } }>;
      const name = (props["Client"]?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
      if (!name) continue;
      const status = props["Client status"]?.status?.name ?? null;
      seen.add(page.id);
      try {
        await db.client.upsert({
          where: { notionId: page.id },
          create: { name, notionId: page.id, status, active: status !== "Ended" },
          update: { name, status, active: status !== "Ended", syncedAt: new Date() },
        });
        synced++;
      } catch (e) {
        console.warn(`skip "${name}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);

  let deactivated = 0;
  if (seen.size > 0) {
    const r = await db.client.updateMany({
      where: { notionId: { notIn: Array.from(seen) }, active: true },
      data: { active: false },
    });
    deactivated = r.count;
  }
  console.log(`Synced ${synced} clients from Notion; deactivated ${deactivated} stale.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
