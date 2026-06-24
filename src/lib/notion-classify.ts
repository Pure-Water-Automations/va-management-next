/**
 * Guess which of a workspace's Notion databases is "Projects" and which is
 * "Tasks", to pre-select the OAuth picker. Heuristic first (free); a cheap
 * OpenRouter model refines it only when the names are ambiguous and a key is set.
 * Always degrades gracefully — the user can override the dropdowns either way.
 */
import { env } from "@/lib/env";
import { openrouterChat } from "@/lib/matrix/openrouter";

type Db = { id: string; title: string };

export async function classifyDatabases(databases: Db[]): Promise<{ projects: string | null; tasks: string | null }> {
  if (databases.length === 0) return { projects: null, tasks: null };

  const find = (re: RegExp): string | null => databases.find((d) => re.test(d.title.toLowerCase()))?.id ?? null;
  let projects = find(/\bprojects?\b/);
  let tasks = find(/\btasks?\b/);

  const ambiguous = !projects || !tasks || projects === tasks;
  if (ambiguous && databases.length > 1 && env.OPENROUTER_API_KEY?.trim()) {
    try {
      const list = databases.map((d, i) => `${i}: ${d.title}`).join("\n");
      const res = await openrouterChat({
        model: env.OPENROUTER_TRANSCRIPT_MODEL?.trim() || "google/gemini-2.5-flash-lite",
        temperature: 0,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content:
              'Match Notion databases to roles. Reply with ONLY compact JSON {"projects": <index or null>, "tasks": <index or null>} choosing the database index that best holds PROJECTS and the one that best holds TASKS. Use null if none fits. Never pick the same index for both.',
          },
          { role: "user", content: list },
        ],
      });
      const txt = res.choices?.[0]?.message?.content ?? "";
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]) as { projects?: number | null; tasks?: number | null };
        const pick = (n: number | null | undefined): string | null =>
          typeof n === "number" && databases[n] ? databases[n].id : null;
        const aiP = pick(parsed.projects);
        const aiT = pick(parsed.tasks);
        if (aiP && aiT && aiP !== aiT) {
          projects = aiP;
          tasks = aiT;
        } else {
          if (aiP) projects = aiP;
          if (aiT && aiT !== projects) tasks = aiT;
        }
      }
    } catch {
      /* heuristic stands */
    }
  }

  if (projects && projects === tasks) tasks = null;
  return { projects, tasks };
}
