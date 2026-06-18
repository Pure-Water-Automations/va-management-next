import type { SbResult } from "@/lib/secondbrain/client";

const CONTEXT_HEADING = "## Context (from Second Brain)";
const PRIORITIES = new Set(["Low", "Medium", "High"]);

export type SuggestedTask = { title: string; instructions?: string; priority: "Low" | "Medium" | "High" };
export type Synthesis = { contextSummary: string; tasks: SuggestedTask[] };

// Retrieval (intent sentence for semantic search + the Drive keyword) is built
// inside searchSecondBrain — see src/lib/secondbrain/client.ts.

/** Parse the synthesis model's JSON output defensively. Junk -> empty. */
export function parseSynthesis(raw: string): Synthesis {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return { contextSummary: "", tasks: [] };
  }
  if (!obj || typeof obj !== "object") return { contextSummary: "", tasks: [] };
  const o = obj as Record<string, unknown>;
  const contextSummary = typeof o.contextSummary === "string" ? o.contextSummary : "";
  const rawTasks = Array.isArray(o.tasks) ? o.tasks : [];
  const tasks = rawTasks
    .map((t): SuggestedTask | null => {
      if (!t || typeof t !== "object") return null;
      const r = t as Record<string, unknown>;
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!title) return null;
      const instructions = typeof r.instructions === "string" && r.instructions.trim() ? r.instructions.trim() : undefined;
      const priority = typeof r.priority === "string" && PRIORITIES.has(r.priority) ? (r.priority as SuggestedTask["priority"]) : "Medium";
      return { title, instructions, priority };
    })
    .filter((t): t is SuggestedTask => t !== null);
  if (!contextSummary && tasks.length === 0) return { contextSummary: "", tasks: [] };
  return { contextSummary, tasks };
}

/** Append a markdown block under the Second Brain heading; preserve everything prior. */
export function appendContextBlock(existing: string | null, bodyMarkdown: string): string {
  const base = (existing ?? "").trimEnd();
  const body = bodyMarkdown.trim();
  if (base.includes(CONTEXT_HEADING)) {
    // Heading already present: add a dated subsection so we never clobber prior context.
    const stamp = new Date().toISOString().slice(0, 10);
    return `${base}\n\n### Added ${stamp}\n${body}`;
  }
  const prefix = base ? `${base}\n\n` : "";
  return `${prefix}${CONTEXT_HEADING}\n${body}`;
}

/** Append accepted context cards under a single heading; preserve everything prior. */
export function mergeContextIntoDescription(existing: string | null, accepted: SbResult[]): string {
  const lines = accepted.map((c) => {
    const link = c.link ? ` (${c.link})` : "";
    return `- **${c.title}** — ${c.snippet}${link} [${c.source}]`;
  });
  return appendContextBlock(existing, lines.join("\n"));
}

// Only propose tasks when at least one retrieved card is a STRONG anchor for this
// project. Strong notion/meeting matches score 0.84-0.96; thin/nonsense projects top
// out around 0.71 on bare client-tag matches. Without this gate the model dutifully
// fabricates confident tasks from tangential snippets (verified: a "Build a Nuke"
// project produced 3 Northeast tasks). Below the anchor we keep the context summary
// but suppress task suggestions.
export const TASK_ANCHOR = 0.75;

export function applyTaskAnchor(s: Synthesis, maxScore: number): Synthesis {
  return maxScore >= TASK_ANCHOR ? s : { contextSummary: s.contextSummary, tasks: [] };
}

/**
 * One OpenRouter call: project + found snippets -> {contextSummary, tasks}. Grounded
 * to the snippets; never invents specifics, ignores snippets about other clients, and
 * only proposes tasks when a strong-anchor card is present (applyTaskAnchor). Returns
 * empty synthesis if the key is unset or the call fails (callers still have the context
 * cards). The openrouter helper is imported lazily so the pure functions above stay
 * env-free for unit tests.
 */
export async function synthesize(
  project: { name: string; client?: string | null; description?: string | null },
  found: SbResult[],
): Promise<Synthesis> {
  if (found.length === 0) return { contextSummary: "", tasks: [] };
  const maxScore = found.reduce((m, c) => Math.max(m, c.score ?? 0), 0);
  const snippetBlock = found
    .map((c, i) => `${i + 1}. [${c.source}] ${c.title}: ${c.snippet}${c.link ? ` (${c.link})` : ""}`)
    .join("\n");
  const system =
    "You enrich a work project for a virtual-assistant team. Given the project and snippets found in the team's knowledge base, return STRICT JSON: " +
    '{"contextSummary": string, "tasks": [{"title": string, "instructions": string, "priority": "Low"|"Medium"|"High"}]}. ' +
    "Ground every task in the snippets — never invent client names, dates, URLs, or specifics not present. " +
    "ONLY use snippets clearly about THIS project and THIS client; IGNORE snippets that are about other named clients, other people's 1:1s, or unrelated topics. " +
    "Set priority only from explicit urgency in a snippet (deadlines, escalations); otherwise use Medium. " +
    "If the snippets are only tangential to this project, return an EMPTY tasks array rather than inventing work. Return ONLY the JSON, no prose, no code fence.";
  const userMsg =
    `PROJECT: ${project.name}${project.client ? ` (client: ${project.client})` : ""}\n` +
    `DESCRIPTION: ${project.description ?? "(none)"}\n\n` +
    `SNIPPETS:\n${snippetBlock}`;
  try {
    const { openrouterChat } = await import("@/lib/matrix/openrouter");
    const res = await openrouterChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      temperature: 0.2,
      max_tokens: 900,
    });
    const content = res.choices?.[0]?.message?.content ?? "";
    return applyTaskAnchor(parseSynthesis(content), maxScore);
  } catch {
    return { contextSummary: "", tasks: [] };
  }
}
