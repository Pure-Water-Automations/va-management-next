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
  for (const line of text.split("\n")) {
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

/**
 * Connect to the SecondBrain MCP, call every search tool with `query`, and return
 * the union of normalized results. Each tool is independent: a tool that throws
 * yields []. Returns { results, errors } so the caller can surface partial failures.
 */
export async function searchSecondBrain(query: string): Promise<{
  results: SbResult[];
  errors: { source: string; message: string }[];
}> {
  const client = new Client({ name: "va-management-enhance", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL()));
  const errors: { source: string; message: string }[] = [];
  try {
    await client.connect(transport);
    const settled = await Promise.allSettled(
      SB_SEARCH_TOOLS.map((name) =>
        client.callTool({ name, arguments: { query } }).then((res) => normalizeToolResult(name, res)),
      ),
    );
    const results: SbResult[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") results.push(...s.value);
      else errors.push({ source: SB_SEARCH_TOOLS[i], message: s.reason instanceof Error ? s.reason.message : String(s.reason) });
    });
    return { results, errors };
  } catch (err) {
    return { results: [], errors: [{ source: "mcp", message: err instanceof Error ? err.message : String(err) }] };
  } finally {
    await client.close().catch(() => {});
  }
}
