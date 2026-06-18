import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type SbResult = {
  source: "notion" | "meeting" | "drive";
  title: string;
  snippet: string;
  link?: string;
  score?: number; // higher = more relevant (for sorting)
};

// Read the URL directly from process.env (also declared + validated in src/lib/env.ts
// at app boot) so the pure, unit-tested parsers in this module never trigger env parsing.
const MCP_URL = () => process.env.SECONDBRAIN_MCP_URL || "http://localhost:8787/mcp";

// Relevance gates calibrated against the live server: strong notion matches score
// ~0.55-0.96 hybrid (noise 0.32-0.39); strong meeting matches are ~0.31 distance.
const NOTION_MIN_HYBRID = 0.45;
const MEETING_MAX_DISTANCE = 0.4;
const DRIVE_SCORE = 0.42; // fixed rank for keyword Drive — supplementary, below strong semantic
const MIN_TOP_CONFIDENCE = 0.5; // if the best card is weaker than this, show nothing

const MAX_CARDS_PER_TOOL = 4;
const MAX_TOTAL_CARDS = 8;
const MAX_SNIPPET_CHARS = 300;
const MIN_SNIPPET_CHARS = 12; // drop title-only / empty-excerpt cards
const MAX_SCAN_LINES = 400;

// Catalog/dump/PII-list/admin/notification names that are never useful project context.
const JUNK_NAME =
  /unsubscrib|members?\.csv$|^_index|^\.|contacts?\.csv$|services?\s+agreement|\bnda\b|training\s+assignment|^meeting assets for|are ready!?\s*$/i;
const PLACEHOLDER_SNIPPET = /insufficient (transcript|content)|no (summary|content) (available|found)/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

const TOKEN_STOP = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with", "new",
  "sample", "project", "client", "meeting", "zoom", "time", "region", "all", "plan",
]);

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Redact bare email addresses from any user-facing string. */
function scrubPII(s: string): string {
  return s.replace(EMAIL_RE, "[redacted]");
}

/**
 * Distinctive words from the project NAME (excluding the client's own words + stopwords).
 * Used to keep keyword-Drive hits that actually relate to the project, not just the client.
 */
export function distinctiveProjectTokens(p: ProjectFields): string[] {
  const clientWords = new Set(
    (p.client ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  );
  return [
    ...new Set(
      (p.name ?? "")
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, " ")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !TOKEN_STOP.has(w) && !clientWords.has(w)),
    ),
  ];
}

type McpTextResult = { isError?: boolean; content?: { type?: string; text?: string }[] };

function resultText(result: unknown): string {
  const r = result as McpTextResult | null;
  if (!r || r.isError || !Array.isArray(r.content) || r.content.length === 0) return "";
  return r.content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();
}

/** Pull a readable snippet out of a semantic Excerpt block. */
function cleanExcerpt(raw: string, source: "notion" | "meeting"): string {
  let text = raw.replace(/={3,}[\s\S]*$/, "").trim(); // drop trailing ===== separators
  if (source === "notion") {
    const desc = text.match(/^-\s*(?:Description|Summary):\s*(.+)$/m)?.[1]?.trim();
    if (desc && desc.length > 8) return desc.slice(0, MAX_SNIPPET_CHARS);
    text = text
      .replace(/^Properties:\s*$/m, "")
      .split("\n")
      .filter((l) => !/^-\s+\w[\w \/]*:/.test(l))
      .join(" ");
  }
  return collapse(text).slice(0, MAX_SNIPPET_CHARS);
}

/**
 * Parse the semantic-search tools' block format into ranked, relevance-filtered cards.
 *   notion:  --- Result N (Hybrid Score: X | Semantic Distance: Y) ---  Title:/URL:/Excerpt:
 *   meeting: --- Result N (Distance: Y) ---                              Source:/Path:/Excerpt:
 */
export function parseSemanticResults(text: string, source: "notion" | "meeting"): SbResult[] {
  if (!text || !text.includes("--- Result")) return [];
  const blocks = text.split(/^--- Result \d+ /m).slice(1);
  const cards: SbResult[] = [];

  for (const block of blocks) {
    const header = block.match(/^\(([^)]*)\)/)?.[1] ?? "";
    const hybrid = Number(header.match(/Hybrid Score:\s*([\d.]+)/)?.[1]);
    const distance = Number(header.match(/Distance:\s*([\d.]+)/)?.[1]);

    let score: number;
    if (source === "notion") {
      if (!Number.isFinite(hybrid) || hybrid < NOTION_MIN_HYBRID) continue;
      score = hybrid;
    } else {
      if (!Number.isFinite(distance) || distance > MEETING_MAX_DISTANCE) continue;
      score = 1 - distance;
    }

    const rawTitle =
      block.match(/^Title:\s*(.+)$/m)?.[1] ?? block.match(/^Source:\s*(.+)$/m)?.[1] ?? "";
    const title = collapse(rawTitle.split("|")[0].replace(/\s*\([^)]*\)\s*$/, "")).slice(0, 140);
    if (!title || JUNK_NAME.test(title)) continue;

    const link = block.match(/^URL:\s*(\S+)$/m)?.[1];
    const exIdx = block.indexOf("Excerpt:");
    const snippet = exIdx >= 0 ? cleanExcerpt(block.slice(exIdx + "Excerpt:".length), source) : "";
    if (snippet.trim().length < MIN_SNIPPET_CHARS || PLACEHOLDER_SNIPPET.test(snippet)) continue;

    cards.push({ source, title, snippet, link, score });
    if (cards.length >= MAX_CARDS_PER_TOOL) break;
  }
  return cards;
}

/**
 * Parse search_drive_index grep output. Each match is a markdown table row from the
 * Drive index pointing at a real file: `| `<id>` | <name> | <date> | <owner> | [open](url) |`
 * (and a pinned variant with extra path/type columns). Extract the filename + Drive URL.
 */
export function parseDriveResults(text: string): SbResult[] {
  if (!text || /^no matches found\.?$/i.test(text)) return [];
  const cards: SbResult[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n");

  for (let i = 0; i < lines.length && i < MAX_SCAN_LINES; i++) {
    const line = lines[i];
    if (!line.includes("|")) continue;
    const link =
      line.match(/\[open\]\((https?:\/\/[^)]+)\)/)?.[1] ?? line.match(/https?:\/\/[^\s)|]+/)?.[0];
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);

    const isGrepPath = (c: string) => /\.md:\d+|^\/(app|users)\b/i.test(c);
    let name =
      cells.find((c) => !isGrepPath(c) && /\.(pdf|docx?|xlsx?|pptx?|csv|md|txt|png|jpe?g|gif|key|pages)\s*$/i.test(c)) ??
      cells
        .filter(
          (c) =>
            !isGrepPath(c) &&
            !/^`/.test(c) &&
            !/^\d{4}-\d\d-\d\d/.test(c) &&
            !/\[open\]/.test(c) &&
            !/^https?:/.test(c) &&
            c.length > 3,
        )
        .sort((a, b) => b.length - a.length)[0];
    if (!name) continue;
    name = name.replace(/`/g, "").trim();
    if (JUNK_NAME.test(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const context = cells
      .filter((c) => c !== name && !isGrepPath(c) && !/^`/.test(c) && !/\[open\]/.test(c) && !/^https?:/.test(c))
      .join(" · ");
    cards.push({ source: "drive", title: name.slice(0, 140), snippet: collapse(context).slice(0, MAX_SNIPPET_CHARS), link });
    if (cards.length >= MAX_CARDS_PER_TOOL) break;
  }
  return cards;
}

/** Union of cards, de-duped by source+title, sorted by score desc, capped. */
export function dedupeResults(cards: SbResult[], max = MAX_TOTAL_CARDS): SbResult[] {
  const sorted = [...cards].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const seen = new Set<string>();
  const out: SbResult[] = [];
  for (const c of sorted) {
    const key = `${c.source}|${c.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

export type ProjectFields = { name: string; client?: string | null; description?: string | null };

/**
 * Retrieve relevant context from the SecondBrain MCP for a project:
 *  - semantic_search_notion + semantic_search_meetings ranked by meaning (relevance-gated)
 *  - search_drive_index keyed on the client phrase, then kept only when the filename also
 *    matches a distinctive project word (so a broad client like "Pure Water" / "Northeast"
 *    can't dump every client-name-matching contract/invoice) and scored below strong semantic
 * then PII-scrubbed, junk-filtered, de-duped, ranked, and capped. If the best card is weaker
 * than MIN_TOP_CONFIDENCE the project has no real context — return nothing rather than padding.
 * Each tool is independent; one that throws yields []. Returns { results, errors }.
 */
export async function searchSecondBrain(
  project: ProjectFields,
  opts?: { intent?: string; driveQuery?: string },
): Promise<{ results: SbResult[]; errors: { source: string; message: string }[] }> {
  const intent =
    opts?.intent ??
    collapse([project.name, project.description, project.client ? `Client: ${project.client}` : ""].filter(Boolean).join(". "));
  const driveQuery = opts?.driveQuery ?? (project.client?.trim() || project.name.trim());
  const tokens = distinctiveProjectTokens(project);

  const client = new Client({ name: "va-management-enhance", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL()));
  const errors: { source: string; message: string }[] = [];

  const jobs: { source: string; run: () => Promise<SbResult[]> }[] = [
    { source: "notion", run: () => client.callTool({ name: "semantic_search_notion", arguments: { query: intent } }).then((r) => parseSemanticResults(resultText(r), "notion")) },
    { source: "meeting", run: () => client.callTool({ name: "semantic_search_meetings", arguments: { query: intent } }).then((r) => parseSemanticResults(resultText(r), "meeting")) },
    { source: "drive", run: () => client.callTool({ name: "search_drive_index", arguments: { query: driveQuery, maxMatches: 12 } }).then((r) => parseDriveResults(resultText(r))) },
  ];

  try {
    await client.connect(transport);
    const settled = await Promise.allSettled(jobs.map((j) => j.run()));
    const collected: SbResult[] = [];
    settled.forEach((s, i) => {
      if (s.status !== "fulfilled") {
        errors.push({ source: jobs[i].source, message: s.reason instanceof Error ? s.reason.message : String(s.reason) });
        return;
      }
      if (jobs[i].source === "drive") {
        // Keep a Drive hit only if its name relates to the project (not just the client),
        // and rank it below strong semantic hits.
        const kept = s.value
          .filter((c) => tokens.length > 0 && tokens.some((t) => c.title.toLowerCase().includes(t)))
          .map((c) => ({ ...c, score: DRIVE_SCORE }));
        collected.push(...kept);
      } else {
        collected.push(...s.value);
      }
    });

    const cleaned = collected
      .map((c) => ({ ...c, title: scrubPII(c.title), snippet: scrubPII(c.snippet) }))
      .filter((c) => !JUNK_NAME.test(c.title));

    const ranked = dedupeResults(cleaned, MAX_TOTAL_CARDS);
    if (ranked.length === 0 || (ranked[0].score ?? 0) < MIN_TOP_CONFIDENCE) {
      return { results: [], errors };
    }
    return { results: ranked, errors };
  } catch (err) {
    return { results: [], errors: [{ source: "mcp", message: err instanceof Error ? err.message : String(err) }] };
  } finally {
    await client.close().catch(() => {});
  }
}
