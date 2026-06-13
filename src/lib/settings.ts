import { db } from "@/lib/db";

/** Load all System_Config settings into a key→value map (non-secret values). */
export async function loadSettings(): Promise<Map<string, string>> {
  const rows = await db.setting.findMany();
  const map = new Map<string, string>();
  for (const r of rows) if (r.value != null) map.set(r.key, r.value);
  return map;
}

export function num(map: Map<string, string>, key: string, fallback: number): number {
  const v = map.get(key);
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function str(map: Map<string, string>, key: string, fallback = ""): string {
  return map.get(key) ?? fallback;
}
