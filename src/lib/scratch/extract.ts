// Pure prompt-building for Purii's scratchpad extraction (OS Hub, Phase 3).
// Sibling of lib/meetings/extract.ts — same strict-JSON contract, same parser
// (parseExtractedItems), same confirm-first doctrine: the model only PROPOSES;
// nothing becomes a task until a human confirms each item.

export function buildScratchExtractionMessages(
  projectName: string,
  items: string[],
  maxChars = 8000,
): { role: "system" | "user"; content: string }[] {
  const list = items
    .map((t) => `- ${t.replace(/\s+/g, " ").trim()}`)
    .join("\n")
    .slice(0, maxChars);

  return [
    {
      role: "system",
      content: [
        "You extract actionable tasks from a team's freeform project scratchpad.",
        "Return ONLY a JSON array (no prose, no markdown fence). Each element:",
        '{"title": string (imperative, <= 80 chars), "description": string (optional, 1 sentence of context)}',
        "Rules: only genuinely actionable items — skip musings, questions already answered, and duplicates.",
        "If nothing is actionable, return [].",
      ].join("\n"),
    },
    {
      role: "user",
      content: `PROJECT: ${projectName}\nSCRATCHPAD BULLETS:\n${list}`,
    },
  ];
}
