import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type SbResult = {
  source: "notion" | "meeting" | "drive";
  title: string;
  snippet: string;
  link?: string;
  score?: number; // higher = more relevant (for sorting); absent for keyword drive
};

// Read the URL directly from process.env (also declared + validated in src/lib/env.ts
// at app boot) so the pure, unit-tested parsers in this module never trigger env parsing.
const MCP_URL = () => process.env.SECONDBRAIN_MCP_URL || "http://localhost:8787/mcp";

// Relevance gates calibrated against the live server: a strong notion match scores
// ~0.60 hybrid, a nonsense query ~0.016; a strong meeting match is ~0.31 distance.
const NOTION_MIN_HYBRID = 0.3;
const MEETING_MAX_DISTANCE = 0.45;

const MAX_CARDS_PER_TOOL = 4;
const MAX_TOTAL_CARDS = 10;
const MAX_SNIPPET_CHARS = 300;
const MAX_SCAN_LINES = 400; // drive grep can be large; only the top rows matter

// Catalog/dump/PII files that are never useful "context" (the drive index rows point
// to real files, so this only rejects results whose own name is a dump/list).
const JUNK_NAME = /unsubscrib|members?\.csv$|^_index|^\.|contacts?\.csv$/i;

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

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Pull a readable snippet out of a semantic Excerpt block. */
function cleanExcerpt(raw: string, source: "notion" | "meeting"): string {
  let text = raw.replace(/={3,}[\s\S]*$/, "").trim(); // drop trailing ===== separators
  if (source === "notion") {
    // Prefer the human Description/Summary property if present (it's the gold line).
    const desc = text.match(/^-\s*(?:Description|Summary):\s*(.+)$/m)?.[1]?.trim();
    if (desc && desc.length > 8) return desc.slice(0, MAX_SNIPPET_CHARS);
    // Otherwise strip the Properties dump + bullet lines and keep the body.
    text = text
      .replace(/^Properties:\s*$/m, "")
      .split("\n")
      .filter((l) => !/^-\s+\w[\w \/]*:/.test(l)) // property bullets like "- Status: Done"
      .join(" ");
  }
  return collapse(text).slice(0, MAX_SNIPPET_CHARS);
}

/**
 * Parse the semantic-search tools' block format into ranked, relevance-filtered cards.
 * Handles both shapes:
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
    if (!title) continue;
    if (JUNK_NAME.test(title)) continue;

    const link = block.match(/^URL:\s*(\S+)$/m)?.[1];
    const exIdx = block.indexOf("Excerpt:");
    const snippet = exIdx >= 0 ? cleanExcerpt(block.slice(exIdx + "Excerpt:".length), source) : "";

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

    // The filename cell is the one ending in a file extension; fall back to the longest
    // descriptive cell that isn't the id / date / link.
    // The leading cell is the grep `path:line:` prefix of the index file itself — never useful.
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

    // Snippet: the folder/path + date context (drop the grep prefix, id, url, the name itself).
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
  const sorted = [...cards].sort((a, b) => (b.score ?? 0.5) - (a.score ?? 0.5));
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
 *  - semantic_search_notion + semantic_search_meetings ranked by meaning (with a relevance gate)
 *  - search_drive_index keyed on the client phrase (semantic isn't available for Drive)
 * then junk-filtered, de-duped, ranked, and capped. Each tool is independent; one that
 * throws yields []. Returns { results, errors } so the caller can surface partial failures.
 */
export async function searchSecondBrain(
  project: ProjectFields,
  opts?: { intent?: string; driveQuery?: string },
): Promise<{ results: SbResult[]; errors: { source: string; message: string }[] }> {
  const intent =
    opts?.intent ??
    collapse([project.name, project.description, project.client ? `Client: ${project.client}` : ""].filter(Boolean).join(". "));
  const driveQuery = opts?.driveQuery ?? (project.client?.trim() || project.name.trim());

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
      if (s.status === "fulfilled") collected.push(...s.value);
      else errors.push({ source: jobs[i].source, message: s.reason instanceof Error ? s.reason.message : String(s.reason) });
    });
    return { results: dedupeResults(collected), errors };
  } catch (err) {
    return { results: [], errors: [{ source: "mcp", message: err instanceof Error ? err.message : String(err) }] };
  } finally {
    await client.close().catch(() => {});
  }
}
