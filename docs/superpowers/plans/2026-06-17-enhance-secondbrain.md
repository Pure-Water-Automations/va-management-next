# Enhance with Second Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a beta "Enhance with Second Brain" button to the project detail page that searches the SecondBrain mirrors (Notion, Drive, meetings), streams found context + AI-suggested tasks into a confirmation modal, and on confirm appends accepted context to the project description and creates accepted tasks.

**Architecture:** A project-manager-gated button opens a full-screen modal that consumes a Server-Sent-Events route. The route reads the project, queries the SecondBrain cloud MCP (`http://localhost:8787/mcp`) via the official `@modelcontextprotocol/sdk` client for three search tools in parallel, streams each result, then runs one OpenRouter synthesis call to produce suggested tasks. A separate plain-JSON "apply" route writes accepted items using the existing `updateProject` and `createTask` actions. No DB migration.

**Tech Stack:** Next.js 15 (App Router, route handlers), TypeScript, Prisma/Postgres, `@modelcontextprotocol/sdk` (new), OpenRouter via the existing `openrouterChat` helper, `node:test` runner.

---

## Reference context (read before starting)

Patterns this plan follows — skim these so the code matches the codebase:

- **Env:** `src/lib/env.ts` — zod schema, `optionalEnvString(...)` helper for optional strings.
- **OpenRouter:** `src/lib/matrix/openrouter.ts` exports `openrouterChat({messages, temperature, max_tokens})` → `{choices:[{message:{content}}]}`. Throws if `OPENROUTER_API_KEY` unset.
- **Action route wrapper:** `src/lib/api.ts` — `action(handler, {allow?})` resolves Cloudflare-Access identity, parses JSON, audits, returns `{ok, result}` / `{ok:false, error}`. `str(body,key)` / `optStr` helpers. `allow` is a **synchronous** `(role)=>boolean`.
- **Identity:** `src/lib/auth/access.ts` — `getCurrentUser()` returns the Prisma `User` row (`{id, email, role, isAdmin, ...}`). `CurrentUser` type exported.
- **Auth predicates:** `src/lib/auth/roles.ts` — `canManageProjects(role)` (sync). `src/lib/auth/delegation.ts` — `canUserDelegateProjects(actorId, role)` (async; the guard `createProject`/`updateProject` use).
- **Write actions:** `src/lib/actions/projects.ts` — `updateProject(actorId, role, projectId, {description})`. `src/lib/actions/tasks.ts` — `createTask(actorId, role, {title, instructions?, priority?, projectId, assignedToId, dueDate?, links?})`.
- **Project read:** `src/lib/reads/projects.ts` — `getProjectDetail(id)` returns `{id, name, description, client, type, tasks, ...}`.
- **Client POST helper:** `src/components/ActionButton.tsx` exports `postAction(path, body)` → `{ok, error?, result?}`.
- **Overlay pattern:** `src/components/CommandPalette.tsx:168` — `position:"fixed", inset:0, zIndex:1000, backdropFilter:"blur(2px)"`.
- **Quick-add form (assignee select + date):** `src/components/ProjectQuickAddTask.tsx` — mirror its `input` style + `<select>`/`<input type=date>`.
- **Page that hosts the button:** `src/app/(app)/hr/projects/[id]/page.tsx` — already computes `canEdit` and an `assignees` array (`db.user` where role in VA/SENIOR_VA, active). The button goes in the header `div` next to the Edit button (line ~61).
- **Tests:** `tests/*.test.ts`, `node:test` + `node:assert/strict`, import from `../src/lib/...`. Run all: `npm test`. Run one file: `node --import tsx --test tests/<file>.test.ts`.

**Type defined once, used everywhere** (declare in Task 2, import elsewhere):
```ts
// src/lib/secondbrain/client.ts
export type SbResult = { source: string; title: string; snippet: string; link?: string };
```

---

## Task 1: Add SECONDBRAIN_MCP_URL env var + MCP SDK dependency

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `package.json` (dependency)

- [ ] **Step 1: Install the MCP SDK**

Run:
```bash
npm install @modelcontextprotocol/sdk
```
Expected: `package.json` gains `"@modelcontextprotocol/sdk": "^1.x"`, install succeeds.

- [ ] **Step 2: Add the env var to the schema**

In `src/lib/env.ts`, inside `envSchema = z.object({ ... })`, add after the `OPENROUTER_MATRIX_MODEL` line:
```ts
  // SecondBrain cloud MCP endpoint (co-located on the same VPS). Used by the
  // "Enhance with Second Brain" feature to search Notion/Drive/meeting mirrors.
  SECONDBRAIN_MCP_URL: optionalEnvString(z.string().url()),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/env.ts
git commit -m "feat(enhance): add MCP SDK dep + SECONDBRAIN_MCP_URL env"
```

---

## Task 2: SecondBrain MCP client + result normalization

**Files:**
- Create: `src/lib/secondbrain/client.ts`
- Test: `tests/secondbrain-client.test.ts`

The only unit-tested part is the pure `normalizeToolResult`. The live connection is verified on the VPS in Task 8.

- [ ] **Step 1: Write the failing test**

Create `tests/secondbrain-client.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";

import { normalizeToolResult } from "../src/lib/secondbrain/client";

test("normalizes a JSON-array text block into SbResult[]", () => {
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify([
          { title: "NE Website Brief", snippet: "WP site, brand refresh needed", link: "https://notion.so/x" },
          { title: "Strategy Call", snippet: "new hero section" },
        ]),
      },
    ],
  };
  assert.deepEqual(normalizeToolResult("search_notion_mirror", result), [
    { source: "search_notion_mirror", title: "NE Website Brief", snippet: "WP site, brand refresh needed", link: "https://notion.so/x" },
    { source: "search_notion_mirror", title: "Strategy Call", snippet: "new hero section", link: undefined },
  ]);
});

test("falls back to a single card when text is plain prose, not JSON", () => {
  const result = { content: [{ type: "text", text: "Found 2 docs about the website." }] };
  const out = normalizeToolResult("search_drive_index", result);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "search_drive_index");
  assert.equal(out[0].snippet, "Found 2 docs about the website.");
});

test("returns [] for an error result", () => {
  assert.deepEqual(normalizeToolResult("search_meetings", { isError: true, content: [{ type: "text", text: "boom" }] }), []);
});

test("returns [] for empty/missing content", () => {
  assert.deepEqual(normalizeToolResult("search_meetings", {}), []);
  assert.deepEqual(normalizeToolResult("search_meetings", { content: [] }), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/secondbrain-client.test.ts`
Expected: FAIL — cannot find module `../src/lib/secondbrain/client`.

- [ ] **Step 3: Write the client + normalizer**

Create `src/lib/secondbrain/client.ts`:
```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { env } from "@/lib/env";

export type SbResult = { source: string; title: string; snippet: string; link?: string };

const MCP_URL = () => env.SECONDBRAIN_MCP_URL || "http://localhost:8787/mcp";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/secondbrain-client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/secondbrain/client.ts tests/secondbrain-client.test.ts
git commit -m "feat(enhance): SecondBrain MCP client + result normalizer"
```

---

## Task 3: Enhance orchestration — query, synthesis parse, description merge

**Files:**
- Create: `src/lib/secondbrain/enhance.ts`
- Test: `tests/secondbrain-enhance.test.ts`

Three pure functions (unit-tested) plus one async synthesis wrapper.

- [ ] **Step 1: Write the failing test**

Create `tests/secondbrain-enhance.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildQuery, parseSynthesis, mergeContextIntoDescription } from "../src/lib/secondbrain/enhance";

test("buildQuery joins name, client, and first sentence of description", () => {
  assert.equal(
    buildQuery({ name: "NE Website Refresh", client: "Northeast", description: "Rebuild the site. Lots of detail here." }),
    "NE Website Refresh Northeast Rebuild the site",
  );
});

test("buildQuery tolerates missing client/description", () => {
  assert.equal(buildQuery({ name: "Payroll Cleanup", client: null, description: null }), "Payroll Cleanup");
});

test("parseSynthesis accepts valid JSON and coerces tasks", () => {
  const out = parseSynthesis(
    JSON.stringify({
      contextSummary: "Site needs a refresh.",
      tasks: [
        { title: "Audit site", instructions: "Review pages", priority: "High" },
        { title: "Draft copy" },
      ],
    }),
  );
  assert.equal(out.contextSummary, "Site needs a refresh.");
  assert.equal(out.tasks.length, 2);
  assert.equal(out.tasks[0].priority, "High");
  assert.equal(out.tasks[1].priority, "Medium"); // default
  assert.equal(out.tasks[1].instructions, undefined);
});

test("parseSynthesis returns empty tasks on junk", () => {
  assert.deepEqual(parseSynthesis("not json at all"), { contextSummary: "", tasks: [] });
  assert.deepEqual(parseSynthesis(JSON.stringify({ nope: 1 })), { contextSummary: "", tasks: [] });
});

test("parseSynthesis strips a markdown code fence", () => {
  const out = parseSynthesis('```json\n{"contextSummary":"x","tasks":[]}\n```');
  assert.equal(out.contextSummary, "x");
});

test("mergeContextIntoDescription appends a heading block, preserving the original", () => {
  const merged = mergeContextIntoDescription("Existing description.", [
    { source: "search_notion_mirror", title: "Brief", snippet: "WP site", link: "https://n/x" },
  ]);
  assert.match(merged, /^Existing description\./);
  assert.match(merged, /## Context \(from Second Brain\)/);
  assert.match(merged, /Brief/);
  assert.match(merged, /https:\/\/n\/x/);
});

test("mergeContextIntoDescription adds a dated subsection when the heading already exists", () => {
  const first = mergeContextIntoDescription("Base.", [{ source: "s", title: "A", snippet: "a" }]);
  const second = mergeContextIntoDescription(first, [{ source: "s", title: "B", snippet: "b" }]);
  // Heading appears once; both items present.
  assert.equal(second.match(/## Context \(from Second Brain\)/g)?.length, 1);
  assert.match(second, /A/);
  assert.match(second, /B/);
  assert.match(second, /### Added /); // dated subsection for the second merge
});

test("mergeContextIntoDescription handles a null starting description", () => {
  const merged = mergeContextIntoDescription(null, [{ source: "s", title: "A", snippet: "a" }]);
  assert.match(merged, /## Context \(from Second Brain\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/secondbrain-enhance.test.ts`
Expected: FAIL — cannot find module `../src/lib/secondbrain/enhance`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/secondbrain/enhance.ts`:
```ts
import { openrouterChat } from "@/lib/matrix/openrouter";
import type { SbResult } from "@/lib/secondbrain/client";

const CONTEXT_HEADING = "## Context (from Second Brain)";
const PRIORITIES = new Set(["Low", "Medium", "High"]);

export type SuggestedTask = { title: string; instructions?: string; priority: "Low" | "Medium" | "High" };
export type Synthesis = { contextSummary: string; tasks: SuggestedTask[] };

/** Build one search query from the project's identifying fields. */
export function buildQuery(p: { name: string; client?: string | null; description?: string | null }): string {
  const firstSentence = (p.description ?? "").split(/(?<=[.!?])\s/)[0]?.trim() ?? "";
  return [p.name, p.client ?? "", firstSentence].map((s) => s.trim()).filter(Boolean).join(" ");
}

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

/** Append accepted context cards under a single heading; preserve everything prior. */
export function mergeContextIntoDescription(existing: string | null, accepted: SbResult[]): string {
  const base = (existing ?? "").trimEnd();
  const lines = accepted.map((c) => {
    const link = c.link ? ` (${c.link})` : "";
    return `- **${c.title}** — ${c.snippet}${link} [${c.source}]`;
  });
  if (base.includes(CONTEXT_HEADING)) {
    // Heading already present: add a dated subsection so we never clobber prior context.
    const stamp = new Date().toISOString().slice(0, 10);
    return `${base}\n\n### Added ${stamp}\n${lines.join("\n")}`;
  }
  const prefix = base ? `${base}\n\n` : "";
  return `${prefix}${CONTEXT_HEADING}\n${lines.join("\n")}`;
}

/**
 * One OpenRouter call: project + found snippets -> {contextSummary, tasks}. Grounded
 * to the snippets; never invents specifics. Returns empty synthesis if the key is
 * unset or the call fails (callers still have the context cards).
 */
export async function synthesize(
  project: { name: string; client?: string | null; description?: string | null },
  found: SbResult[],
): Promise<Synthesis> {
  if (found.length === 0) return { contextSummary: "", tasks: [] };
  const snippetBlock = found
    .map((c, i) => `${i + 1}. [${c.source}] ${c.title}: ${c.snippet}${c.link ? ` (${c.link})` : ""}`)
    .join("\n");
  const system =
    "You enrich a work project for a virtual-assistant team. Given the project and snippets found in the team's knowledge base, return STRICT JSON: " +
    '{"contextSummary": string, "tasks": [{"title": string, "instructions": string, "priority": "Low"|"Medium"|"High"}]}. ' +
    "Ground every task in the snippets — never invent client names, dates, URLs, or specifics not present. " +
    "If the snippets are thin, return fewer tasks or an empty tasks array. Return ONLY the JSON, no prose, no code fence.";
  const userMsg =
    `PROJECT: ${project.name}${project.client ? ` (client: ${project.client})` : ""}\n` +
    `DESCRIPTION: ${project.description ?? "(none)"}\n\n` +
    `SNIPPETS:\n${snippetBlock}`;
  try {
    const res = await openrouterChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      temperature: 0.2,
      max_tokens: 900,
    });
    const content = res.choices?.[0]?.message?.content ?? "";
    return parseSynthesis(content);
  } catch {
    return { contextSummary: "", tasks: [] };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/secondbrain-enhance.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/secondbrain/enhance.ts tests/secondbrain-enhance.test.ts
git commit -m "feat(enhance): query builder, synthesis parse, description merge"
```

---

## Task 4: SSE enhance route

**Files:**
- Create: `src/app/api/hr/projects/[id]/enhance/route.ts`

This route streams; it cannot use the JSON `action()` wrapper. It does identity + role guard manually, then returns a `text/event-stream`.

- [ ] **Step 1: Write the route**

Create `src/app/api/hr/projects/[id]/enhance/route.ts`:
```ts
import { getCurrentUser } from "@/lib/auth/access";
import { canUserDelegateProjects } from "@/lib/auth/delegation";
import { getProjectDetail } from "@/lib/reads/projects";
import { searchSecondBrain } from "@/lib/secondbrain/client";
import { buildQuery, synthesize } from "@/lib/secondbrain/enhance";

export const dynamic = "force-dynamic";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user.isAdmin && !(await canUserDelegateProjects(user.id, user.role))) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const project = await getProjectDetail(id);
  if (!project) return Response.json({ ok: false, error: "Project not found" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
      try {
        const query = buildQuery({ name: project.name, client: project.client, description: project.description });
        const { results, errors } = await searchSecondBrain(query);

        let idx = 0;
        for (const r of results) send("context", { id: `c${idx++}`, ...r });
        for (const e of errors) send("error", e);

        const synthesis = await synthesize(
          { name: project.name, client: project.client, description: project.description },
          results,
        );
        send("tasks", {
          contextSummary: synthesis.contextSummary,
          tasks: synthesis.tasks.map((t, i) => ({ id: `t${i}`, ...t })),
        });
      } catch (err) {
        send("error", { source: "enhance", message: err instanceof Error ? err.message : "Enhance failed" });
      } finally {
        send("done", {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Confirms `project.client`/`project.description` exist on the `getProjectDetail` return type and `user.id`/`user.role` on `CurrentUser`.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/hr/projects/[id]/enhance/route.ts"
git commit -m "feat(enhance): SSE route streaming context + suggested tasks"
```

---

## Task 5: Apply route (confirm)

**Files:**
- Create: `src/app/api/hr/projects/[id]/enhance/apply/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/hr/projects/[id]/enhance/apply/route.ts`:
```ts
import { getCurrentUser } from "@/lib/auth/access";
import { canUserDelegateProjects } from "@/lib/auth/delegation";
import { getProjectDetail } from "@/lib/reads/projects";
import { updateProject } from "@/lib/actions/projects";
import { createTask } from "@/lib/actions/tasks";
import { mergeContextIntoDescription } from "@/lib/secondbrain/enhance";
import { runWithActor } from "@/lib/request-context";
import type { SbResult } from "@/lib/secondbrain/client";

export const dynamic = "force-dynamic";

type AcceptedTask = {
  title: string;
  instructions?: string;
  priority?: string;
  assignedToId?: string;
  dueDate?: string;
  link?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user.isAdmin && !(await canUserDelegateProjects(user.id, user.role))) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  let body: { acceptedContext?: SbResult[]; acceptedTasks?: AcceptedTask[] };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const acceptedContext = Array.isArray(body.acceptedContext) ? body.acceptedContext : [];
  const acceptedTasks = Array.isArray(body.acceptedTasks) ? body.acceptedTasks : [];

  const project = await getProjectDetail(id);
  if (!project) return Response.json({ ok: false, error: "Project not found" }, { status: 404 });

  return runWithActor(user.email, async () => {
    // 1) Merge accepted context into the description (independent of task creation).
    let descriptionUpdated = false;
    if (acceptedContext.length > 0) {
      const merged = mergeContextIntoDescription(project.description, acceptedContext);
      await updateProject(user.id, user.role, id, { description: merged });
      descriptionUpdated = true;
    }

    // 2) Create accepted tasks one at a time; report per-task outcome.
    const created: string[] = [];
    const failed: { title: string; error: string }[] = [];
    for (const t of acceptedTasks) {
      try {
        if (!t.assignedToId) throw new Error("No assignee selected");
        const task = await createTask(user.id, user.role, {
          title: t.title,
          instructions: t.instructions,
          priority: t.priority,
          projectId: id,
          assignedToId: t.assignedToId,
          dueDate: t.dueDate,
          links: t.link,
        });
        created.push(task.id);
      } catch (err) {
        failed.push({ title: t.title, error: err instanceof Error ? err.message : "Failed" });
      }
    }

    return Response.json({ ok: true, result: { descriptionUpdated, created: created.length, failed } });
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Confirms `createTask`/`updateProject` signatures and `runWithActor` import path.)

> If `runWithActor` is not exported from `@/lib/request-context`, open `src/lib/request-context.ts` to confirm the exact export name (it is used in `src/lib/api.ts` as `runWithActor(email, fn)`); match that import.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/hr/projects/[id]/enhance/apply/route.ts"
git commit -m "feat(enhance): apply route merges context + creates accepted tasks"
```

---

## Task 6: EnhanceModal component

**Files:**
- Create: `src/components/EnhanceModal.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/EnhanceModal.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

type Assignee = { id: string; name: string | null; email: string };
type ContextCard = { id: string; source: string; title: string; snippet: string; link?: string; accepted: boolean };
type TaskCard = {
  id: string;
  title: string;
  instructions?: string;
  priority: string;
  accepted: boolean;
  expanded: boolean;
  assignedToId: string;
  dueDate: string;
};

const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "6px 8px",
  font: "inherit",
  background: "var(--color-surface)",
  width: "100%",
  boxSizing: "border-box",
};

export function EnhanceModal({
  projectId,
  projectName,
  assignees,
  onClose,
}: {
  projectId: string;
  projectName: string;
  assignees: Assignee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [contexts, setContexts] = useState<ContextCard[]>([]);
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/hr/projects/${projectId}/enhance`, { method: "POST" });
        if (!res.ok || !res.body) {
          setNotices((n) => [...n, "Couldn't reach Second Brain."]);
          setLoading(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        // Parse the SSE text stream incrementally: events are separated by a blank line.
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const evMatch = chunk.match(/^event: (.+)$/m);
            const dataMatch = chunk.match(/^data: (.+)$/m);
            if (!evMatch || !dataMatch) continue;
            const ev = evMatch[1].trim();
            let data: any;
            try { data = JSON.parse(dataMatch[1]); } catch { continue; }
            if (cancelled) return;
            if (ev === "context") {
              setContexts((c) => [...c, { ...data, accepted: true }]);
            } else if (ev === "tasks") {
              setSummary(data.contextSummary ?? "");
              setTasks(
                (data.tasks ?? []).map((t: any) => ({
                  ...t,
                  accepted: true,
                  expanded: false,
                  assignedToId: "",
                  dueDate: "",
                })),
              );
            } else if (ev === "error") {
              setNotices((n) => [...n, `${data.source}: ${data.message}`]);
            } else if (ev === "done") {
              setLoading(false);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setNotices((n) => [...n, "Second Brain request failed."]);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const acceptedContextCount = contexts.filter((c) => c.accepted).length;
  const acceptedTaskCount = tasks.filter((t) => t.accepted).length;

  async function apply() {
    setApplying(true);
    const res = await postAction(`/api/hr/projects/${projectId}/enhance/apply`, {
      acceptedContext: contexts.filter((c) => c.accepted).map(({ source, title, snippet, link }) => ({ source, title, snippet, link })),
      acceptedTasks: tasks.filter((t) => t.accepted).map((t) => ({
        title: t.title,
        instructions: t.instructions,
        priority: t.priority,
        assignedToId: t.assignedToId || undefined,
        dueDate: t.dueDate || undefined,
        link: contexts[0]?.link,
      })),
    });
    setApplying(false);
    if (!res.ok) {
      window.alert(res.error ?? "Apply failed");
      return;
    }
    const r = res.result as { created: number; failed: { title: string; error: string }[] } | undefined;
    if (r?.failed?.length) {
      window.alert(`Added ${r.created} task(s). ${r.failed.length} failed:\n` + r.failed.map((f) => `- ${f.title}: ${f.error}`).join("\n"));
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(16,24,32,.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--color-surface)", borderRadius: "var(--radius-card)", width: "min(960px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(16,24,32,.32)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <h2 style={{ margin: 0 }}>✨ Second Brain — {projectName}</h2>
          {loading && <span className="small" style={{ color: "var(--color-text-tertiary)" }}>Searching Notion, Drive, and meetings…</span>}
          {summary && !loading && <p className="small" style={{ margin: "6px 0 0", color: "var(--color-text-secondary)" }}>{summary}</p>}
        </div>

        {notices.length > 0 && (
          <div style={{ padding: "8px 20px", background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
            {notices.map((n, i) => <div key={i}>⚠ {n}</div>)}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 20, overflowY: "auto" }}>
          {/* Context column */}
          <div>
            <div className="small" style={{ fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 8 }}>CONTEXT FOUND</div>
            {contexts.length === 0 && !loading && <p className="small" style={{ color: "var(--color-text-tertiary)" }}>No related context found.</p>}
            {contexts.map((c) => (
              <div key={c.id} style={{ border: `1px solid ${c.accepted ? "var(--color-navy-500, #1b3a6b)" : "var(--color-border)"}`, borderRadius: "var(--radius-input)", padding: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{c.title}</div>
                <div className="small" style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>{c.snippet}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                  <Button size="sm" variant={c.accepted ? "primary" : "ghost"} onClick={() => setContexts((cs) => cs.map((x) => x.id === c.id ? { ...x, accepted: !x.accepted } : x))}>
                    {c.accepted ? "✓ Accepted" : "Accept"}
                  </Button>
                  {c.link && <a className="small" href={c.link} target="_blank" rel="noreferrer" style={{ color: "var(--color-text-tertiary)" }}>source</a>}
                </div>
              </div>
            ))}
            {loading && <div style={{ height: 48, border: "1px dashed var(--color-border)", borderRadius: "var(--radius-input)", opacity: 0.5 }} />}
          </div>

          {/* Tasks column */}
          <div>
            <div className="small" style={{ fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 8 }}>SUGGESTED TASKS</div>
            {tasks.length === 0 && !loading && <p className="small" style={{ color: "var(--color-text-tertiary)" }}>No task suggestions.</p>}
            {tasks.map((t) => (
              <div key={t.id} style={{ border: `1px solid ${t.accepted ? "var(--color-navy-500, #1b3a6b)" : "var(--color-border)"}`, borderRadius: "var(--radius-input)", padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{t.title}</div>
                  <button onClick={() => setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, expanded: !x.expanded } : x))} className="small" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)" }}>
                    {t.expanded ? "▲" : "▼"}
                  </button>
                </div>
                {t.expanded && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                    <select style={input} value={t.assignedToId} onChange={(e) => setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, assignedToId: e.target.value } : x))}>
                      <option value="">Assign to…</option>
                      {assignees.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.email}</option>)}
                    </select>
                    <input type="date" style={input} value={t.dueDate} onChange={(e) => setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, dueDate: e.target.value } : x))} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <Button size="sm" variant={t.accepted ? "primary" : "ghost"} onClick={() => setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, accepted: !x.accepted } : x))}>
                    {t.accepted ? "✓ Add" : "Skipped"}
                  </Button>
                </div>
              </div>
            ))}
            {loading && <div style={{ height: 48, border: "1px dashed var(--color-border)", borderRadius: "var(--radius-input)", opacity: 0.5 }} />}
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={applying} disabled={applying || (acceptedContextCount === 0 && acceptedTaskCount === 0)} onClick={apply}>
            Confirm selected ({acceptedContextCount + acceptedTaskCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Confirms `Button` accepts `variant`/`size`/`loading`/`onClick`; if `variant="ghost"`/`"primary"` aren't valid, open `src/components/ui/Button.tsx` and use the actual variant names.)

- [ ] **Step 3: Commit**

```bash
git add src/components/EnhanceModal.tsx
git commit -m "feat(enhance): confirmation modal streaming context + tasks"
```

---

## Task 7: Wire the button into the project detail page

**Files:**
- Create: `src/components/EnhanceButton.tsx`
- Modify: `src/app/(app)/hr/projects/[id]/page.tsx`

The page is a server component; the button needs client state to open the modal, so it gets a small client wrapper.

- [ ] **Step 1: Create the button wrapper**

Create `src/components/EnhanceButton.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EnhanceModal } from "@/components/EnhanceModal";

type Assignee = { id: string; name: string | null; email: string };

export function EnhanceButton({
  projectId,
  projectName,
  assignees,
}: {
  projectId: string;
  projectName: string;
  assignees: Assignee[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        ✨ Enhance with Second Brain
      </Button>
      {open && (
        <EnhanceModal
          projectId={projectId}
          projectName={projectName}
          assignees={assignees}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Import and render it in the page header**

In `src/app/(app)/hr/projects/[id]/page.tsx`, add to the imports (after the `ProjectQuickAddTask` import, line ~13):
```tsx
import { EnhanceButton } from "@/components/EnhanceButton";
```

Then in the header actions `div` (the one containing `ProjectStatusControls` and the Edit button, ~line 54-66), add the button **before** the Edit button, gated on `canEdit`:
```tsx
          {canEdit && (
            <EnhanceButton projectId={project.id} projectName={project.name} assignees={assignees} />
          )}
```

(Place it directly above the existing `{canEdit && ( <Button href=...>Edit</Button> )}` block. `assignees` is already computed on the page.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If `variant="secondary"` is invalid for `Button`, use a valid variant from `src/components/ui/Button.tsx`, e.g. `"ghost"`.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS — the new routes compile and the page renders.

- [ ] **Step 5: Commit**

```bash
git add src/components/EnhanceButton.tsx "src/app/(app)/hr/projects/[id]/page.tsx"
git commit -m "feat(enhance): add Enhance button to project detail header"
```

---

## Task 8: Full test run + manual VPS smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all existing tests + the new `secondbrain-client` and `secondbrain-enhance` tests PASS (≥ 22 + 12 new).

- [ ] **Step 2: Typecheck + build clean**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 3: Deploy to the VPS and smoke-test the live MCP**

The SecondBrain MCP only exists on the VPS, so the live path is verified there.
```bash
./deploy.sh
```
Then in a browser (signed in as a project manager), open a project at
`https://team.pwasecondbrain.uk/hr/projects/<id>`, click **✨ Enhance with Second Brain**, and verify:
- The modal opens immediately with skeletons.
- Context cards stream into the left column (Notion/Drive/meeting results).
- Suggested tasks appear in the right column after synthesis.
- Accepting a context piece + a task (with assignee + due date) and clicking **Confirm selected** appends a `## Context (from Second Brain)` block to the description and creates the task(s).

- [ ] **Step 4: If the MCP result shape differs from the normalizer's assumptions**

If context cards come through as a single `(result)` prose card instead of structured items, inspect the real tool output:
```bash
ssh root@74.208.40.108 "journalctl -u va-management-web -n 80 --no-pager"
```
Then adjust the key names in `normalizeToolResult` (`src/lib/secondbrain/client.ts`, the `o.title ?? o.name ...` / `o.snippet ?? o.text ...` fallbacks) to match the SecondBrain tools' actual JSON, update the corresponding test in `tests/secondbrain-client.test.ts`, re-run `node --import tsx --test tests/secondbrain-client.test.ts`, and redeploy.

- [ ] **Step 5: Commit any normalizer adjustments**

```bash
git add src/lib/secondbrain/client.ts tests/secondbrain-client.test.ts
git commit -m "fix(enhance): align normalizer with live SecondBrain tool output"
```

---

## Self-review notes

- **Spec coverage:** trigger button (T7) · gated on canEdit (T7) · Notion+Drive+Meetings search (T2, `SB_SEARCH_TOOLS`) · SSE stream (T4) · OpenRouter synthesis grounded-only (T3 `synthesize`) · two-column modal w/ skeletons (T6) · accept/skip context + expandable tasks w/ assignee+due date (T6) · append-to-description merge (T3, T5) · createTask per accepted (T5) · per-source + per-task error handling (T2 `errors`, T4, T5) · empty/junk fallbacks (T2, T3) · auth guard = canUserDelegateProjects (T4, T5) · env var + SDK dep (T1) · unit tests for pure logic + VPS smoke (T2, T3, T8). All spec sections map to a task.
- **Open assumption flagged honestly:** the exact JSON shape returned by the SecondBrain MCP search tools is not verifiable from this repo; the normalizer is defensive and Task 8 Step 4 is the explicit reconcile-against-live step.
