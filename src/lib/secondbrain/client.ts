import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type SbResult = { source: string; title: string; snippet: string; link?: string };

// Read the URL directly from process.env (it is also declared + validated in
// src/lib/env.ts at app boot) so the pure, unit-tested normalizer in this module
// never triggers env-schema parsing during tests.
const MCP_URL = () => process.env.SECONDBRAIN_MCP_URL || "http://localhost:8787/mcp";

/** Search tools to fan out to on the SecondBrain MCP. */
export const SB_SEARCH_TOOLS = ["search_notion_mirror", "search_drive_index", "search_meetings"] as const;
export type SbSearchTool = (typeof SB_SEARCH_TOOLS)[number];

type McpTextResult = {
  isError?: boolean;
  content?: { type?: string; text?: string }[];
};

// Hard caps so a high-recall query (search_meetings can return >500KB of grep
// output) never floods the modal or the OpenRouter synthesis prompt.
const MAX_CARDS_PER_TOOL = 6;
const MAX_LINES_PER_FILE = 3;
const MAX_SNIPPET_CHARS = 320;
const MAX_SCAN_LINES = 600; // stop scanning a huge grep payload once enough rows are seen
const MAX_TOTAL_CARDS = 12; // global cap across all tools + queries (modal + synthesis)

/** Turn a mirror file path into a readable title: basename, minus `--<id>` suffix + extension. */
function prettyTitle(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/--[0-9a-f]{6,}$/i, "")
    .trim() || base;
}

/**
 * Flatten an MCP tool result's text blocks into SbResult[]. Pure + defensive.
 *
 * The SecondBrain mirror search tools return **grep-style** text — newline-separated
 * `path:line:matched-content` rows (verified against the live server) — so the primary
 * parser groups those rows by file into one capped card each. A JSON-array payload is
 * also accepted (in case a tool returns structured data). Anything else — including the
 * literal "No matches found." and arbitrary prose — yields [] (never a giant junk card).
 */
export function normalizeToolResult(toolName: string, result: unknown): SbResult[] {
  const r = result as McpTextResult | null;
  if (!r || r.isError || !Array.isArray(r.content) || r.content.length === 0) return [];

  const text = r.content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();
  if (!text || /^no matches found\.?$/i.test(text)) return [];

  // 1) Structured JSON array (some tools may return this).
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const cards = parsed
        .map((item): SbResult | null => {
          if (!item || typeof item !== "object") return null;
          const o = item as Record<string, unknown>;
          const title = String(o.title ?? o.name ?? o.subject ?? "").trim();
          const snippet = String(o.snippet ?? o.text ?? o.summary ?? o.body ?? "").trim();
          if (!title && !snippet) return null;
          const link = typeof o.link === "string" ? o.link : typeof o.url === "string" ? o.url : undefined;
          return { source: toolName, title: title || "(untitled)", snippet, link };
        })
        .filter((c): c is SbResult => c !== null);
      if (cards.length) return cards.slice(0, MAX_CARDS_PER_TOOL);
    }
  } catch {
    // not JSON — fall through to grep-line parsing
  }

  // 2) grep-style `path:line:content` rows grouped into one card per file.
  const byFile = new Map<string, string[]>();
  const lines = text.split("\n");
  for (let li = 0; li < lines.length && li < MAX_SCAN_LINES; li++) {
    const line = lines[li];
    const m = line.match(/^(.+?):(\d+):(.*)$/);
    if (!m) continue;
    const path = m[1];
    const content = m[3].trim();
    if (!content) continue;
    if (!byFile.has(path)) {
      if (byFile.size >= MAX_CARDS_PER_TOOL) continue;
      byFile.set(path, []);
    }
    const arr = byFile.get(path)!;
    if (arr.length < MAX_LINES_PER_FILE) arr.push(content);
  }

  const cards: SbResult[] = [];
  for (const [path, lines] of byFile) {
    const snippet = lines.join(" · ").slice(0, MAX_SNIPPET_CHARS);
    const link = lines.join(" ").match(/https?:\/\/[^\s)\]]+/)?.[0];
    cards.push({ source: toolName, title: prettyTitle(path), snippet, link });
  }
  return cards;
}

/** Union of cards, de-duped by source+title, capped to keep the modal + synthesis bounded. */
export function dedupeResults(cards: SbResult[], max = MAX_TOTAL_CARDS): SbResult[] {
  const seen = new Set<string>();
  const out: SbResult[] = [];
  for (const c of cards) {
    const key = `${c.source}|${c.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Connect to the SecondBrain MCP, call every search tool with each query, and return
 * the de-duped union of normalized results. The mirror tools do literal substring
 * matching, so callers pass several SHORT queries (keywords) rather than one long
 * string. Each tool/query is independent: one that throws yields []. Returns
 * { results, errors } so the caller can surface partial failures.
 */
export async function searchSecondBrain(queries: string | string[]): Promise<{
  results: SbResult[];
  errors: { source: string; message: string }[];
}> {
  const qs = (Array.isArray(queries) ? queries : [queries]).map((q) => q.trim()).filter(Boolean);
  if (qs.length === 0) return { results: [], errors: [] };

  const client = new Client({ name: "va-management-enhance", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL()));
  const errors: { source: string; message: string }[] = [];
  try {
    await client.connect(transport);
    const jobs: { source: string; promise: Promise<SbResult[]> }[] = [];
    for (const query of qs) {
      for (const name of SB_SEARCH_TOOLS) {
        jobs.push({
          source: name,
          promise: client.callTool({ name, arguments: { query } }).then((res) => normalizeToolResult(name, res)),
        });
      }
    }
    const settled = await Promise.allSettled(jobs.map((j) => j.promise));
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
