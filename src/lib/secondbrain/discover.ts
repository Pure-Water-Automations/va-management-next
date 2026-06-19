import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ORResponse } from "@/lib/matrix/openrouter"; // type-only: avoids env parse at import

const MCP_URL = () => process.env.SECONDBRAIN_MCP_URL || "http://localhost:8787/mcp";
const MAX_STEPS = 8;
const MAX_TOOL_RESULT_CHARS = 3000;
// Same split as the enhance agent: DeepSeek explores comms, Haiku writes the proposals.
const SEARCH_MODEL = () => process.env.OPENROUTER_ENHANCE_SEARCH_MODEL || process.env.OPENROUTER_MATRIX_MODEL || "deepseek/deepseek-chat-v3.1";
const PROPOSE_MODEL = () => process.env.OPENROUTER_ENHANCE_MODEL || "anthropic/claude-3.5-haiku";

export type ProposedTask = { title: string; priority: "Low" | "Medium" | "High" };
export type ProposedProject = {
  name: string;
  description?: string;
  client?: string;
  rationale?: string;
  sourceQuote?: string;
  tasks: ProposedTask[];
};
export type DiscoverResult =
  | { kind: "proposals"; projects: ProposedProject[] }
  | { kind: "error"; message: string };

type ChatFn = (body: {
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
  max_tokens?: number;
  model?: string;
}) => Promise<ORResponse>;

type ConvoMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_recent_meetings",
      description: "List the team's recent meeting transcripts (titles + dates). Call this first to see which meetings happened in the lookback window.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_meetings",
      description: "Semantic search over meeting transcripts — returns excerpts. Use to read what was discussed/decided/requested in recent meetings.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_whatsapp",
      description: "Search recent WhatsApp messages (returns messages with timestamps, sender, content). Use topic queries to find requests, commitments, and decisions.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_email",
      description: "Search the recent Gmail index for relevant emails (subjects + snippets). Use simple topic terms.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_projects",
      description: "Finish. Propose NEW projects worth creating based on the recent communications you read. Do NOT duplicate the existing projects you were given. Each project needs a clear rationale grounded in a specific message/meeting, and a few concrete starter tasks. If nothing new is warranted, return an empty projects array.",
      parameters: {
        type: "object",
        properties: {
          projects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Short, specific project name" },
                description: { type: "string" },
                client: { type: "string", description: "Client/org if clearly identifiable, else omit" },
                rationale: { type: "string", description: "Why this is a project, grounded in what you read" },
                sourceQuote: { type: "string", description: "A short verbatim quote from the source comm + who/where" },
                tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { title: { type: "string" }, priority: { type: "string", enum: ["Low", "Medium", "High"] } },
                    required: ["title"],
                  },
                },
              },
              required: ["name", "tasks"],
            },
          },
        },
        required: ["projects"],
      },
    },
  },
];

function resultText(result: unknown): string {
  const r = result as { isError?: boolean; content?: { type?: string; text?: string }[] } | null;
  if (!r || r.isError || !Array.isArray(r.content)) return "";
  return r.content.filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => c.text as string).join("\n").trim();
}

async function runTool(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const query = typeof args.query === "string" ? args.query : "";
  let r: unknown;
  if (name === "list_recent_meetings") r = await client.callTool({ name: "search_meetings", arguments: { query: "", maxMatches: 20 } });
  else if (name === "read_meetings") r = await client.callTool({ name: "semantic_search_meetings", arguments: { query } });
  else if (name === "search_whatsapp") r = await client.callTool({ name: "query_whatsapp", arguments: { query, limit: 15 } });
  else if (name === "search_email") r = await client.callTool({ name: "search_gmail_recent", arguments: { query, maxMatches: 8 } });
  else return `Unknown tool: ${name}`;
  return (resultText(r) || "No results.").slice(0, MAX_TOOL_RESULT_CHARS);
}

const PRIORITIES = new Set(["Low", "Medium", "High"]);

/** Validate the model's propose_projects payload. */
export function parseProposals(args: Record<string, unknown>): DiscoverResult {
  const raw = Array.isArray(args.projects) ? args.projects : [];
  const projects = raw
    .map((p): ProposedProject | null => {
      if (!p || typeof p !== "object") return null;
      const o = p as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) return null;
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
      const tasks = (Array.isArray(o.tasks) ? o.tasks : [])
        .map((t): ProposedTask | null => {
          if (!t || typeof t !== "object") return null;
          const to = t as Record<string, unknown>;
          const title = typeof to.title === "string" ? to.title.trim() : "";
          if (!title) return null;
          const priority = typeof to.priority === "string" && PRIORITIES.has(to.priority) ? (to.priority as ProposedTask["priority"]) : "Medium";
          return { title, priority };
        })
        .filter((t): t is ProposedTask => t !== null);
      return { name, description: str(o.description), client: str(o.client), rationale: str(o.rationale), sourceQuote: str(o.sourceQuote), tasks };
    })
    .filter((p): p is ProposedProject => p !== null);
  return { kind: "proposals", projects };
}

function buildSystemPrompt(): string {
  return [
    "You scan a virtual-assistant team's recent communications (meeting transcripts, WhatsApp, email) to surface NEW projects worth tracking that aren't already in the system.",
    "Process: call list_recent_meetings first, then read_meetings / search_whatsapp / search_email from a few angles to understand what was discussed, requested, decided, or committed to. Look for concrete new initiatives, client requests, deliverables, or recurring asks — not routine chatter.",
    "Then call propose_projects. Rules: (1) ONLY propose projects clearly implied by the recent comms; ground each in a specific message/meeting with a short quote. (2) NEVER duplicate or near-duplicate an existing project (you'll be given the list). (3) Each project gets a short specific name, a one-line description, the client/org if identifiable, and 2-4 concrete starter tasks. (4) Be conservative — quality over quantity; if nothing clearly new is warranted, return an empty projects array. Do not invent.",
  ].join("\n");
}

function buildUserPrompt(existingProjectNames: string[], windowLabel: string, prompt?: string): string {
  return [
    `LOOKBACK WINDOW: ${windowLabel}. Only consider communications from this window.`,
    `EXISTING PROJECTS (do NOT propose duplicates of these): ${existingProjectNames.length ? existingProjectNames.map((n) => `"${n}"`).join(", ") : "(none yet)"}`,
    prompt?.trim() ? `SUPERVISOR FOCUS: ${prompt.trim()}` : "",
  ].filter(Boolean).join("\n");
}

type SearchFn = (name: string, args: Record<string, unknown>) => Promise<string>;

export async function runDiscoverLoop(
  convo: ConvoMsg[],
  chat: ChatFn,
  search: SearchFn,
  onStep: (label: string) => void,
  maxSteps: number,
  searchModel: string,
  proposeModel: string,
): Promise<DiscoverResult> {
  const proposeOnly = TOOLS.filter((t) => t.function.name === "propose_projects");
  const labels: Record<string, string> = {
    list_recent_meetings: "Listing recent meetings",
    read_meetings: "Reading meetings",
    search_whatsapp: "Scanning WhatsApp",
    search_email: "Scanning email",
  };

  for (let step = 0; step < maxSteps; step++) {
    if (step === maxSteps - 1) return propose(convo, chat, proposeOnly, proposeModel);

    const data = await chat({ messages: convo, tools: TOOLS, tool_choice: "auto", temperature: 0.3, max_tokens: 1800, model: searchModel });
    const msg = data.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (!calls.length) return propose(convo, chat, proposeOnly, proposeModel);

    convo.push({ role: "assistant", content: msg?.content ?? null, tool_calls: msg?.tool_calls });
    for (const call of calls) {
      const name = call.function?.name ?? "";
      const id = call.id ?? "";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      if (name === "propose_projects") return propose(convo, chat, proposeOnly, proposeModel);
      if (name in labels) {
        const q = typeof args.query === "string" ? args.query : "";
        onStep(`${labels[name]}${q ? ` — “${q.slice(0, 50)}”` : ""}`);
        let out = "";
        try {
          out = await search(name, args);
        } catch (err) {
          out = `Failed: ${err instanceof Error ? err.message : String(err)}`;
        }
        convo.push({ role: "tool", tool_call_id: id, content: out });
        continue;
      }
      convo.push({ role: "tool", tool_call_id: id, content: `Unknown tool: ${name}` });
    }
  }
  return propose(convo, chat, proposeOnly, proposeModel);
}

/** Force the proposal step with the propose model (only that tool offered). */
async function propose(convo: ConvoMsg[], chat: ChatFn, proposeOnly: unknown[], model: string): Promise<DiscoverResult> {
  const conv: ConvoMsg[] = [
    ...convo,
    { role: "user", content: "Stop searching. Based ONLY on the recent communications above, call propose_projects now with NEW projects (never duplicates of the existing list). If nothing new is clearly warranted, return an empty projects array." },
  ];
  try {
    const data = await chat({
      messages: conv,
      tools: proposeOnly,
      tool_choice: { type: "function", function: { name: "propose_projects" } },
      temperature: 0.3,
      max_tokens: 2000,
      model,
    });
    const call = (data.choices?.[0]?.message?.tool_calls ?? []).find((c) => c.function?.name === "propose_projects");
    if (call) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      return parseProposals(args);
    }
  } catch {
    /* ignore */
  }
  return { kind: "proposals", projects: [] };
}

/**
 * Scan recent communications and propose new projects (+ starter tasks), de-duped
 * against the existing project list. `onStep` streams progress.
 */
export async function discoverProjects(opts: {
  existingProjectNames: string[];
  windowLabel: string;
  prompt?: string;
  onStep?: (label: string) => void;
  chat?: ChatFn;
  searchFn?: SearchFn;
  maxSteps?: number;
}): Promise<DiscoverResult> {
  const onStep = opts.onStep ?? (() => {});
  const maxSteps = opts.maxSteps ?? MAX_STEPS;

  let chat = opts.chat;
  if (!chat) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) return { kind: "error", message: "The AI scan isn't configured (no OpenRouter key)." };
    chat = (await import("@/lib/matrix/openrouter")).openrouterChat;
  }

  const convo: ConvoMsg[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserPrompt(opts.existingProjectNames, opts.windowLabel, opts.prompt) },
  ];

  const searchModel = SEARCH_MODEL();
  const proposeModel = PROPOSE_MODEL();

  if (opts.searchFn) {
    return runDiscoverLoop(convo, chat, opts.searchFn, onStep, maxSteps, searchModel, proposeModel);
  }

  const client = new Client({ name: "va-management-discover", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL()));
  try {
    await client.connect(transport);
    return await runDiscoverLoop(convo, chat, (n, a) => runTool(client, n, a), onStep, maxSteps, searchModel, proposeModel);
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "AI scan failed." };
  } finally {
    await client.close().catch(() => {});
  }
}
