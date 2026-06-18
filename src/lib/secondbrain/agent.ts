import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ORResponse } from "@/lib/matrix/openrouter"; // type-only: avoids env parse at import (lazy value import below)
import { parseDriveResults, type ProjectFields } from "@/lib/secondbrain/client";

const MCP_URL = () => process.env.SECONDBRAIN_MCP_URL || "http://localhost:8787/mcp";
const MAX_STEPS = 8;
const MAX_TOOL_RESULT_CHARS = 3200; // cap each search result fed back to the model
// Split models: DeepSeek explores more varied search angles and surfaces richer
// transcript content (the better SEARCHER); Claude Haiku writes a tighter, better-
// grounded brief from that gathered context (the better WRITER). Each is overridable.
const SEARCH_MODEL = () => process.env.OPENROUTER_ENHANCE_SEARCH_MODEL || process.env.OPENROUTER_MATRIX_MODEL || "deepseek/deepseek-chat-v3.1";
const BRIEF_MODEL = () => process.env.OPENROUTER_ENHANCE_MODEL || "anthropic/claude-3.5-haiku";

export type EnhanceTask = { title: string; instructions?: string; priority: "Low" | "Medium" | "High" };
export type EnhanceSource = { title: string; link?: string; kind?: string };
export type EnhanceFindings = {
  kind: "findings";
  brief: string;
  tasks: EnhanceTask[];
  sources: EnhanceSource[];
};
export type EnhanceQuestions = { kind: "questions"; questions: string[] };
export type EnhanceError = { kind: "error"; message: string };
export type EnhanceResult = EnhanceFindings | EnhanceQuestions | EnhanceError;

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

const SEARCH_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_meetings",
      description:
        "Semantic search over the team's meeting transcripts. Returns ranked excerpts. Use natural-language, intent-rich queries; search multiple angles before concluding.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notion",
      description:
        "Semantic search over the team's Notion notes, SOPs, projects, and ideas. Returns ranked excerpts with titles + URLs.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_drive",
      description:
        "Keyword search over the team's Google Drive index (documents, sheets, PDFs). Returns matching filenames + links.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_clarifying_questions",
      description:
        "Ask the supervisor 1-3 short questions — ONLY when the project is too vague to search well AND no guidance was provided. Never use this if the supervisor already gave guidance or the description is specific.",
      parameters: {
        type: "object",
        properties: { questions: { type: "array", items: { type: "string" }, maxItems: 3 } },
        required: ["questions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_findings",
      description:
        "Finish. Provide a synthesized brief (markdown narrative grounded in what you read, with short quotes and source titles), grounded task suggestions, and the sources you used.",
      parameters: {
        type: "object",
        properties: {
          brief: { type: "string", description: "Markdown. What the Second Brain knows about this project — synthesized, with brief quotes and source names. Empty string if nothing relevant was found." },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                instructions: { type: "string" },
                priority: { type: "string", enum: ["Low", "Medium", "High"] },
              },
              required: ["title"],
            },
          },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" }, link: { type: "string" }, kind: { type: "string" } },
              required: ["title"],
            },
          },
        },
        required: ["brief", "tasks", "sources"],
      },
    },
  },
];

function resultText(result: unknown): string {
  const r = result as { isError?: boolean; content?: { type?: string; text?: string }[] } | null;
  if (!r || r.isError || !Array.isArray(r.content)) return "";
  return r.content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();
}

async function runSearch(client: Client, name: string, query: string): Promise<string> {
  if (name === "search_drive") {
    const r = await client.callTool({ name: "search_drive_index", arguments: { query, maxMatches: 8 } });
    const cards = parseDriveResults(resultText(r));
    if (!cards.length) return "No Drive files found.";
    return cards.map((c) => `- ${c.title}${c.link ? ` <${c.link}>` : ""}`).join("\n").slice(0, MAX_TOOL_RESULT_CHARS);
  }
  const tool = name === "search_meetings" ? "semantic_search_meetings" : "semantic_search_notion";
  const r = await client.callTool({ name: tool, arguments: { query } });
  const text = resultText(r);
  return text ? text.slice(0, MAX_TOOL_RESULT_CHARS) : "No results.";
}

/** Validate the model's submit_findings payload into typed findings. */
export function parseFindings(args: Record<string, unknown>): EnhanceFindings {
  const brief = typeof args.brief === "string" ? args.brief.trim() : "";
  const rawTasks = Array.isArray(args.tasks) ? args.tasks : [];
  const PRIORITIES = new Set(["Low", "Medium", "High"]);
  const tasks = rawTasks
    .map((t): EnhanceTask | null => {
      if (!t || typeof t !== "object") return null;
      const o = t as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) return null;
      const instructions = typeof o.instructions === "string" && o.instructions.trim() ? o.instructions.trim() : undefined;
      const priority = typeof o.priority === "string" && PRIORITIES.has(o.priority) ? (o.priority as EnhanceTask["priority"]) : "Medium";
      return { title, instructions, priority };
    })
    .filter((t): t is EnhanceTask => t !== null);
  const rawSources = Array.isArray(args.sources) ? args.sources : [];
  const sources = rawSources
    .map((s): EnhanceSource | null => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) return null;
      return { title, link: typeof o.link === "string" ? o.link : undefined, kind: typeof o.kind === "string" ? o.kind : undefined };
    })
    .filter((s): s is EnhanceSource => s !== null);
  return { kind: "findings", brief, tasks, sources };
}

export function buildSystemPrompt(): string {
  return [
    "You are a research assistant helping a virtual-assistant team supervisor understand and plan a project, using the team's Second Brain — Notion notes/SOPs, meeting transcripts, and Google Drive documents.",
    "Work like a diligent analyst: run AT LEAST 4 well-phrased semantic searches from different angles, READ each returned excerpt fully, and look for SPECIFIC quotable details — the stated purpose, cadence, who attends, decisions made, direct quotes. Do not conclude until you can write a specific, quote-backed brief (or have honestly confirmed little exists). Prefer meeting transcripts and Notion notes for substance; use Drive for documents/files.",
    "Then call submit_findings with: (1) a synthesized markdown BRIEF that explains what the Second Brain actually knows about this project — written as a clear narrative with a few short verbatim quotes and the source names, NOT a list of snippets; (2) grounded task suggestions (only tasks supported by what you read — never invent client names, dates, or specifics); (3) the sources you used (title + link when available).",
    "If — and only if — the project is too vague to search well and the supervisor gave no guidance, call ask_clarifying_questions with 1-3 short questions first. If the supervisor provided guidance or answers, do NOT ask; go straight to searching.",
    "If you genuinely find nothing relevant, submit_findings with an honest brief saying so and an empty tasks array. Never fabricate.",
  ].join("\n");
}

function buildUserPrompt(project: ProjectFields, prompt?: string, answers?: string): string {
  return [
    `PROJECT NAME: ${project.name}`,
    project.client ? `CLIENT: ${project.client}` : "",
    `DESCRIPTION: ${project.description?.trim() || "(none provided)"}`,
    prompt?.trim() ? `\nSUPERVISOR ASKED: ${prompt.trim()}` : "",
    answers?.trim() ? `\nSUPERVISOR'S ANSWERS TO YOUR QUESTIONS:\n${answers.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type SearchFn = (name: string, query: string) => Promise<string>;

/**
 * The bounded read-think-search loop, with the chat transport and the search backend
 * both injected so it can be unit-tested without a live model or MCP.
 */
export async function runAgentLoop(
  convo: ConvoMsg[],
  tools: unknown[],
  chat: ChatFn,
  search: SearchFn,
  onStep: (label: string) => void,
  maxSteps: number,
  searchModel: string,
  briefModel: string,
): Promise<EnhanceResult> {
  // The submit_findings-only tool list used to FORCE a conclusion on the final step.
  const submitOnly = (tools as { function?: { name?: string } }[]).filter((t) => t?.function?.name === "submit_findings");

  for (let step = 0; step < maxSteps; step++) {
    // Final step: stop searching and have the BRIEF model synthesize (it can't search now).
    if (step === maxSteps - 1) return finalize(convo, chat, submitOnly, briefModel);

    const data = await chat({ messages: convo, tools, tool_choice: "auto", temperature: 0.3, max_tokens: 1800, model: searchModel });
    const msg = data.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];

    if (!calls.length) {
      // Search model signalled it's done (prose). Hand the gathered context to the brief model.
      return finalize(convo, chat, submitOnly, briefModel);
    }

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

      // The search model only DECIDES it has enough; the brief model writes the synthesis.
      if (name === "submit_findings") return finalize(convo, chat, submitOnly, briefModel);
      if (name === "ask_clarifying_questions") {
        const questions = Array.isArray(args.questions)
          ? args.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 3)
          : [];
        if (questions.length) return { kind: "questions", questions };
        convo.push({ role: "tool", tool_call_id: id, content: "(no questions provided — proceed to search)" });
        continue;
      }
      if (name === "search_meetings" || name === "search_notion" || name === "search_drive") {
        const query = typeof args.query === "string" ? args.query : "";
        onStep(`${name.replace("search_", "Searching ")} — “${query.slice(0, 60)}”`);
        let out = "";
        try {
          out = query ? await search(name, query) : "(empty query)";
        } catch (err) {
          out = `Search failed: ${err instanceof Error ? err.message : String(err)}`;
        }
        convo.push({ role: "tool", tool_call_id: id, content: out });
        continue;
      }
      convo.push({ role: "tool", tool_call_id: id, content: `Unknown tool: ${name}` });
    }
  }
  return finalize(convo, chat, submitOnly, briefModel);
}

/**
 * Force a conclusion with the BRIEF model: ask it to submit_findings (only that tool
 * offered, so it can't keep searching). If it still doesn't, fall back to a no-tools
 * prose brief. Any hallucinated search call here is ignored — we never search now.
 */
async function finalize(convo: ConvoMsg[], chat: ChatFn, submitOnly: unknown[], model: string): Promise<EnhanceResult> {
  const conv: ConvoMsg[] = [
    ...convo,
    { role: "user", content: "Stop searching. Using only what you've already gathered above, call submit_findings now with the brief, grounded tasks, and sources. If you found little, say so honestly and return an empty tasks array." },
  ];
  try {
    const data = await chat({
      messages: conv,
      tools: submitOnly,
      tool_choice: { type: "function", function: { name: "submit_findings" } },
      temperature: 0.3,
      max_tokens: 1800,
      model,
    });
    const msg = data.choices?.[0]?.message;
    const call = (msg?.tool_calls ?? []).find((c) => c.function?.name === "submit_findings");
    if (call) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      return parseFindings(args);
    }
    if (msg?.content?.trim()) return { kind: "findings", brief: msg.content.trim(), tasks: [], sources: [] };
  } catch {
    /* fall through to prose */
  }

  // Last resort: a plain prose brief, no tools.
  try {
    const data = await chat({
      messages: [...convo, { role: "user", content: "Write a concise markdown brief of what the Second Brain shows about this project, with any short quotes and source names. If little was found, say so plainly. Do not call any tools." }],
      temperature: 0.3,
      max_tokens: 1400,
      model,
    });
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (text) return { kind: "findings", brief: text, tasks: [], sources: [] };
  } catch {
    /* ignore */
  }
  return { kind: "error", message: "Couldn't synthesize the findings — try again." };
}

/**
 * Agentic enhance: a bounded read-think-search loop over the SecondBrain MCP. Returns
 * either clarifying questions (when the project is thin and no guidance was given), a
 * synthesized brief + grounded tasks + sources, or an error. `onStep` streams progress.
 */
export async function enhanceResearch(opts: {
  project: ProjectFields;
  prompt?: string;
  answers?: string;
  onStep?: (label: string) => void;
  chat?: ChatFn;
  searchFn?: SearchFn;
  maxSteps?: number;
}): Promise<EnhanceResult> {
  const onStep = opts.onStep ?? (() => {});
  const maxSteps = opts.maxSteps ?? MAX_STEPS;

  // Use the injected chat (tests) or lazy-load the real transport (keeps this module
  // env-free at import so the pure helpers + loop are unit-testable).
  let chat = opts.chat;
  if (!chat) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      return { kind: "error", message: "The AI search isn't configured (no OpenRouter key)." };
    }
    chat = (await import("@/lib/matrix/openrouter")).openrouterChat;
  }

  // If the supervisor already gave guidance/answers, forbid the clarifying-questions tool.
  const hasGuidance = !!(opts.prompt?.trim() || opts.answers?.trim());
  const tools = hasGuidance ? SEARCH_TOOLS.filter((t) => t.function.name !== "ask_clarifying_questions") : SEARCH_TOOLS;

  const convo: ConvoMsg[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserPrompt(opts.project, opts.prompt, opts.answers) },
  ];

  const searchModel = SEARCH_MODEL();
  const briefModel = BRIEF_MODEL();

  // Injected search backend (tests) skips the MCP connection entirely.
  if (opts.searchFn) {
    return runAgentLoop(convo, tools, chat, opts.searchFn, onStep, maxSteps, searchModel, briefModel);
  }

  const client = new Client({ name: "va-management-enhance-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL()));
  try {
    await client.connect(transport);
    return await runAgentLoop(convo, tools, chat, (n, q) => runSearch(client, n, q), onStep, maxSteps, searchModel, briefModel);
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "AI search failed." };
  } finally {
    await client.close().catch(() => {});
  }
}
