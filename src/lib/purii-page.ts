// Pure helpers for Purii's page commands (OS Hub, Phase 5.5): prompt builders
// for summarize/checklist and a no-LLM lexical scorer for "find related SOPs".
// Unit-tested in tests/purii-page.test.ts.

import type { Block } from "@/lib/services/blocks";

export function pageToPlainText(title: string, blocks: Block[], maxChars = 9000): string {
  const lines = [
    `PAGE: ${title}`,
    ...blocks.map((b) => {
      const marker =
        b.kind === "h2" ? "## " : b.kind === "todo" ? `[${b.done ? "x" : " "}] ` : b.kind === "ul" || b.kind === "ol" ? "- " : "";
      return `${marker}${b.text}`;
    }),
  ];
  return lines.join("\n").slice(0, maxChars);
}

export function buildSummarizeMessages(title: string, blocks: Block[]) {
  return [
    {
      role: "system" as const,
      content:
        "Summarize the team project page below in 1-2 sentences for a callout banner. Plain text only — no markdown, no quotes, no preamble.",
    },
    { role: "user" as const, content: pageToPlainText(title, blocks) },
  ];
}

export function buildChecklistMessages(title: string, blocks: Block[]) {
  return [
    {
      role: "system" as const,
      content: [
        "Draft a short action checklist (3-6 items) from the team project page below.",
        'Return ONLY a JSON array of strings, e.g. ["Do X","Confirm Y"]. Imperative, <= 70 chars each, no numbering.',
      ].join("\n"),
    },
    { role: "user" as const, content: pageToPlainText(title, blocks) },
  ];
}

export function parseChecklist(text: string): string[] | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(s.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    const items = arr.map((x) => String(x).trim()).filter(Boolean);
    return items.length ? items.slice(0, 6) : null;
  } catch {
    return null;
  }
}

const STOPWORDS = new Set(
  "the a an and or for of to in on with from by is are be this that it as at we our your you".split(" "),
);

function terms(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Lexical relatedness: score candidate docs by term overlap with the page
 * (title terms count double). Deliberately no LLM — fast, free, predictable.
 */
export function scoreRelated(
  pageTitle: string,
  pageBlocks: Block[],
  candidates: { id: string; title: string }[],
  take = 3,
): { id: string; title: string; score: number }[] {
  const titleTerms = terms(pageTitle);
  const bodyTerms = terms(pageBlocks.map((b) => b.text).join(" "));
  return candidates
    .map((c) => {
      const ct = terms(c.title);
      let score = 0;
      for (const t of ct) {
        if (titleTerms.has(t)) score += 2;
        if (bodyTerms.has(t)) score += 1;
      }
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, take);
}
