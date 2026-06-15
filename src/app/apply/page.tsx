import { ApplyClient } from "./ApplyClient";
import { db } from "@/lib/db";
import { DEFAULT_SKILL_OPTIONS } from "@/lib/application-questions";

// PUBLIC application page (outside the (app) auth shell). Reachable without a
// Cloudflare Access login because /apply is in the Access bypass list.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Apply — Pure Water Virtual Assistants",
  description: "Apply to join the Pure Water Automations virtual assistant team.",
};

export default async function ApplyPage() {
  let skillOptions = DEFAULT_SKILL_OPTIONS;
  try {
    const row = await db.setting.findUnique({ where: { key: "skill_list" }, select: { value: true } });
    const parsed = (row?.value || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (parsed.length) skillOptions = parsed;
  } catch {
    // fall back to defaults if the DB is unreachable
  }
  return <ApplyClient skillOptions={skillOptions} />;
}
