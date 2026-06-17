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

/**
 * Flatten an MCP tool result's text blocks into SbResult[]. Pure + defensive:
 * - error result or empty content -> []
 * - text that parses as a JSON array of {title, snippet?, link?} -> one card each
 * - any other non-empty text -> a single card carrying the prose as the snippet
 */
export function normalizeToolResult(toolName: string, result: unknown): SbResult[] {
  const r = result as McpTextResult | null;
  if (!r || r.isError || !Array.isArray(r.content) || r.content.length === 0) return [];

  const text = r.content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();
  if (!text) return [];

  // Preferred shape: a JSON array of record-like items.
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
      return cards;
    }
  } catch {
    // not JSON — fall through to prose fallback
  }

  return [{ source: toolName, title: "(result)", snippet: text }];
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
