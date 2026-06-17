# Purii Matrix Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new admin-only "Matrix mode" to Purii — a code-aware agent (DeepSeek v3.1 via OpenRouter) that reads the real source to answer questions and edits data via the existing safe tools plus a guarded single-record editor, with hard limits so it can't destroy the system.

**Architecture:** A bounded read-think-act loop (`matrixAct`) calls OpenRouter with the existing bypass tools + 3 read-only code tools + one guarded `edit_record` write tool. Read/query/code tools auto-run and feed back into the model; the first write returns a confirmable proposal (reusing today's proposal→execute→audit machinery). Unlocked with "enter the matrix", admin-only, alongside the existing Permission Bypass.

**Tech Stack:** Next.js 15, Prisma + Postgres, OpenRouter (OpenAI-compatible) `deepseek/deepseek-chat-v3.1`, node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-06-16-purii-matrix-mode-design.md`

---

## File structure

**New**
- `src/lib/matrix/openrouter.ts` — `openrouterChat()` transport.
- `src/lib/matrix/code-access.ts` — `safePath`, `listSource`, `searchSource`, `readSource`, `CODE_TOOLS`, `runCodeTool`, `isCodeTool`.
- `src/lib/matrix/record-editor.ts` — `validateEdit`, `buildRecordEdit`, `executeRecordEdit`, `EDIT_RECORD_TOOL`.
- `src/lib/matrix/context.ts` — `MATRIX_PROMPT`.
- `src/lib/matrix/agent.ts` — `matrixAct()`, `MATRIX_TOOLS`, `isWriteTool`, `runReadTool`, `MatrixResult`.
- `src/app/api/purii/matrix/route.ts` — the route.
- Tests: `tests/matrix-codeaccess.test.ts`, `tests/matrix-record-editor.test.ts`, `tests/matrix-agent.test.ts`.

**Modified**
- `src/lib/env.ts` — 3 OpenRouter env vars.
- `src/app/api/purii/execute/route.ts` — dispatch `edit_record` → `executeRecordEdit`.
- `src/components/Purii.tsx` — unlock/exit/state/send-branch/visual for Matrix.
- `deploy/systemd/va-management-web.service` — wire the OpenRouter env file.

---

## Task 1: OpenRouter env + transport

**Files:**
- Modify: `src/lib/env.ts`
- Create: `src/lib/matrix/openrouter.ts`

- [ ] **Step 1: Add env vars.** In `src/lib/env.ts`, inside the `z.object({...})` (after the `OPENAI_MODEL` entry), add:
```ts
  OPENROUTER_API_KEY: optionalEnvString(z.string()),
  OPENROUTER_BASE_URL: optionalEnvString(z.string()),
  OPENROUTER_MATRIX_MODEL: optionalEnvString(z.string()),
```

- [ ] **Step 2: Create the transport** `src/lib/matrix/openrouter.ts`:
```ts
import { env } from "@/lib/env";

export type ORResponse = {
  choices?: {
    message?: {
      content?: string;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
};

/** OpenAI-compatible chat completion against OpenRouter (DeepSeek by default). */
export async function openrouterChat(body: {
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
  max_tokens?: number;
}): Promise<ORResponse> {
  const base = env.OPENROUTER_BASE_URL?.replace(/\/+$/, "") || "https://openrouter.ai/api/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MATRIX_MODEL || "deepseek/deepseek-chat-v3.1",
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  return (await res.json()) as ORResponse;
}
```

- [ ] **Step 3: Typecheck.** Run `npm run typecheck` → exits 0.

- [ ] **Step 4: Commit.**
```bash
git add src/lib/env.ts src/lib/matrix/openrouter.ts
git commit -m "feat(matrix): OpenRouter env + chat transport"
```
End every commit message with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 2: Code-access tools (read-only, secret-safe)

**Files:**
- Create: `src/lib/matrix/code-access.ts`
- Test: `tests/matrix-codeaccess.test.ts`

- [ ] **Step 1: Write the failing test** `tests/matrix-codeaccess.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { safePath, readSource } from "../src/lib/matrix/code-access";

test("safePath allows files under src/", () => {
  assert.doesNotThrow(() => safePath("src/lib/db.ts"));
});
test("safePath rejects traversal", () => {
  assert.throws(() => safePath("../../etc/passwd"), /outside/i);
});
test("safePath rejects .env and secrets", () => {
  assert.throws(() => safePath(".env"), /off-limits/i);
  assert.throws(() => safePath("src/lib/.env.local"), /off-limits/i);
  assert.throws(() => safePath(".secrets/token.json"), /off-limits/i);
});
test("safePath rejects token / service-account files even under allowed dirs", () => {
  assert.throws(() => safePath("src/lib/google-token.json"), /off-limits/i);
  assert.throws(() => safePath("prisma/service-account.json"), /off-limits/i);
});
test("safePath rejects dirs that aren't allow-listed", () => {
  assert.throws(() => safePath("node_modules/x"), /off-limits|readable/i);
  assert.throws(() => safePath("design-system/x"), /readable/i);
});
test("readSource returns file contents (truncated)", async () => {
  const txt = await readSource("package.json");
  assert.ok(txt.includes("va-management-next"));
});
```

- [ ] **Step 2: Run it; verify FAIL.** `node --import tsx --env-file-if-exists=.env --test tests/matrix-codeaccess.test.ts` → module not found.

- [ ] **Step 3: Implement** `src/lib/matrix/code-access.ts`:
```ts
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, sep, join } from "node:path";

const ROOT = process.cwd();
const ALLOW_DIRS = ["src", "prisma", "worker", "tests", "scripts"];
const ALLOW_FILES = ["package.json", "tsconfig.json", "AGENTS.md", "README.md"];
const DENY = [
  /\.env/i, /\.secrets/i, /secret/i, /token/i, /credential/i, /service-account/i,
  /\.(pem|key)$/i, /(^|\/)node_modules(\/|$)/, /(^|\/)\.next(\/|$)/, /(^|\/)\.git(\/|$)/,
];
const MAX_READ = 16_000;
const MAX_HITS = 40;

/** Resolve a project-relative path, rejecting traversal, secrets, and non-allowed areas. */
export function safePath(p: string): string {
  const rel = (p || "").replace(/^\.?\/+/, "");
  const abs = resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) throw new Error("Path is outside the project.");
  const r = relative(ROOT, abs);
  if (DENY.some((re) => re.test("/" + r))) throw new Error("That path is off-limits — secrets are never readable.");
  const top = r.split(sep)[0];
  if (!ALLOW_DIRS.includes(top) && !ALLOW_FILES.includes(r)) {
    throw new Error(`Only these areas are readable: ${ALLOW_DIRS.join(", ")} (and ${ALLOW_FILES.join(", ")}).`);
  }
  return abs;
}

export async function listSource(dir: string): Promise<string> {
  const abs = safePath(dir || "src");
  const entries = await readdir(abs, { withFileTypes: true });
  return entries
    .filter((e) => !DENY.some((re) => re.test("/" + e.name)))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort()
    .join("\n");
}

export async function readSource(path: string): Promise<string> {
  const abs = safePath(path);
  const txt = await readFile(abs, "utf8");
  return txt.length > MAX_READ ? txt.slice(0, MAX_READ) + "\n…(truncated)" : txt;
}

async function walk(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 6 || out.length >= 4000) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    const r = relative(ROOT, full);
    if (DENY.some((re) => re.test("/" + r))) continue;
    if (e.isDirectory()) await walk(full, out, depth + 1);
    else if (/\.(ts|tsx|js|jsx|prisma|json|md|css)$/.test(e.name)) out.push(full);
  }
}

export async function searchSource(query: string): Promise<string> {
  const q = (query || "").trim();
  if (!q) return "Give me something to search for.";
  const files: string[] = [];
  for (const d of ALLOW_DIRS) await walk(resolve(ROOT, d), files);
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const hits: string[] = [];
  for (const f of files) {
    let txt = "";
    try { txt = await readFile(f, "utf8"); } catch { continue; }
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push(`${relative(ROOT, f)}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
        if (hits.length >= MAX_HITS) return hits.join("\n") + `\n…(showing first ${MAX_HITS})`;
      }
    }
  }
  return hits.length ? hits.join("\n") : `No matches for "${q}".`;
}

const def = (name: string, description: string, properties: object, required: string[]) =>
  ({ type: "function" as const, function: { name, description, parameters: { type: "object", properties, required } } });

export const CODE_TOOLS = [
  def("list_source", "List files/folders in a project source directory (e.g. 'src/lib').", { dir: { type: "string" } }, []),
  def("search_source", "Search the source code for a string/identifier; returns file:line matches.", { query: { type: "string" } }, ["query"]),
  def("read_source", "Read a source file's contents (e.g. 'src/lib/services/payroll-calc.ts').", { path: { type: "string" } }, ["path"]),
];

const CODE_NAMES = new Set(["list_source", "search_source", "read_source"]);
export function isCodeTool(name: string): boolean { return CODE_NAMES.has(name); }

export async function runCodeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    if (name === "list_source") return await listSource(String(args.dir ?? "src"));
    if (name === "search_source") return await searchSource(String(args.query ?? ""));
    if (name === "read_source") return await readSource(String(args.path ?? ""));
    return `Unknown code tool: ${name}`;
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't read that.";
  }
}
```

- [ ] **Step 4: Run tests; verify PASS.** `node --import tsx --env-file-if-exists=.env --test tests/matrix-codeaccess.test.ts` → all pass. Run `npm run typecheck` → 0.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/matrix/code-access.ts tests/matrix-codeaccess.test.ts
git commit -m "feat(matrix): scoped, secret-safe code-access tools"
```

---

## Task 3: Guarded record editor

**Files:**
- Create: `src/lib/matrix/record-editor.ts`
- Test: `tests/matrix-record-editor.test.ts`

- [ ] **Step 1: Write the failing test** `tests/matrix-record-editor.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEdit } from "../src/lib/matrix/record-editor";

test("rejects non-allowlisted models (User/auth)", () => {
  const r = validateEdit("User", { id: "x" }, { isAdmin: true });
  assert.equal(r.ok, false);
});
test("rejects a non-unique where (no bulk)", () => {
  const r = validateEdit("Va", { name: "Aira" }, { targetHoursWeekly: 20 }); // name is not unique
  assert.equal(r.ok, false);
});
test("accepts a single-row scalar update on an allowed model", () => {
  const r = validateEdit("Va", { vaId: "aira_m" }, { targetHoursWeekly: 25 });
  assert.equal(r.ok, true);
});
test("accepts an enum field (compensationRole)", () => {
  const r = validateEdit("Va", { vaId: "aira_m" }, { compensationRole: "TIER_2" });
  assert.equal(r.ok, true);
});
test("rejects editing id or unknown/relation fields", () => {
  assert.equal(validateEdit("Va", { vaId: "x" }, { vaId: "y" }).ok, false);
  assert.equal(validateEdit("Va", { vaId: "x" }, { sessions: [] }).ok, false);
});
test("rejects empty data", () => {
  assert.equal(validateEdit("Setting", { key: "x" }, {}).ok, false);
});
```

- [ ] **Step 2: Run it; verify FAIL.** `node --import tsx --env-file-if-exists=.env --test tests/matrix-record-editor.test.ts`.

- [ ] **Step 3: Implement** `src/lib/matrix/record-editor.ts`:
```ts
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, logActivity } from "@/lib/activity";
import type { Proposal } from "@/lib/purii-actions";

const ALLOWED_MODELS = new Set([
  "Va", "Candidate", "CompensationRole", "Setting", "Onboarding", "TierReview", "Evaluation",
  "DeskLogHours", "DeskLogEfficiency", "CapacityFlagEvent", "TrainingAssignment", "TrainingSession",
  "TrainingTaskProgress", "PayrollPeriod", "PayrollCalculation", "NotionRef", "Policy",
]);
const BLOCKED_FIELDS = new Set(["id", "createdAt", "updatedAt", "lastUpdated"]);

function meta(model: string) {
  return Prisma.dmmf.datamodel.models.find((m) => m.name === model) ?? null;
}
function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

type Valid = { ok: true; delegate: string } | { ok: false; error: string };

/** All safety guards for edit_record (pure — no DB). Re-run at exec time. */
export function validateEdit(model: string, where: Record<string, unknown>, data: Record<string, unknown>): Valid {
  if (!ALLOWED_MODELS.has(model)) {
    return { ok: false, error: `I can only edit business records (VAs, candidates, settings, etc.) — never "${model}" (logins, audit, or schema are off-limits).` };
  }
  const m = meta(model);
  if (!m) return { ok: false, error: `Unknown model "${model}".` };

  const uniqueNames = new Set(m.fields.filter((f) => f.isId || f.isUnique).map((f) => f.name));
  const whereKeys = Object.keys(where ?? {});
  if (!whereKeys.length || !whereKeys.every((k) => uniqueNames.has(k))) {
    return { ok: false, error: "To stay safe I only change ONE record at a time — identify it by its id or a unique field." };
  }

  const editable = new Set(
    m.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !f.isId && !BLOCKED_FIELDS.has(f.name)).map((f) => f.name),
  );
  const dataKeys = Object.keys(data ?? {});
  if (!dataKeys.length) return { ok: false, error: "Tell me what to change." };
  for (const k of dataKeys) {
    if (!editable.has(k)) return { ok: false, error: `I can't set "${k}" on ${model} (it's not an editable field).` };
  }
  return { ok: true, delegate: delegateName(model) };
}

export async function buildRecordEdit(args: Record<string, unknown>): Promise<Proposal | { error: string }> {
  const model = String(args.model ?? "");
  const where = (args.where ?? {}) as Record<string, unknown>;
  const data = (args.data ?? {}) as Record<string, unknown>;
  const v = validateEdit(model, where, data);
  if (!v.ok) return { error: v.error };
  const current = await (db as Record<string, any>)[v.delegate].findUnique({ where });
  if (!current) return { error: `No ${model} matches ${JSON.stringify(where)}.` };
  const diff = Object.keys(data)
    .map((k) => `${k}: ${JSON.stringify(current[k])} → ${JSON.stringify(data[k])}`)
    .join("; ");
  return { tool: "edit_record", args: { model, delegate: v.delegate, where, data }, summary: `update ${model} (${JSON.stringify(where)}) — ${diff}` };
}

export async function executeRecordEdit(args: Record<string, unknown>, actor: string): Promise<string> {
  const model = String(args.model ?? "");
  const where = (args.where ?? {}) as Record<string, unknown>;
  const data = (args.data ?? {}) as Record<string, unknown>;
  const v = validateEdit(model, where, data); // defense-in-depth: re-validate on execute
  if (!v.ok) throw new Error(v.error);
  await (db as Record<string, any>)[v.delegate].update({ where, data });
  await audit({ actorEmail: actor, action: "bypass.edit_record", target: model, details: { matrix: true, model, where, data } });
  await logActivity({ source: "purii_matrix", eventType: "record_edited", severity: "warning", summary: `${actor} edited ${model} via Matrix: ${JSON.stringify(where)}` });
  return `Updated **${model}**. ✅`;
}

export const EDIT_RECORD_TOOL = {
  type: "function" as const,
  function: {
    name: "edit_record",
    description:
      "Update ONE business record by its id or unique field. Allowed models: Va, Candidate, CompensationRole, Setting, Onboarding, TierReview, Evaluation, DeskLogHours, DeskLogEfficiency, CapacityFlagEvent, TrainingAssignment, TrainingSession, TrainingTaskProgress, PayrollPeriod, PayrollCalculation, NotionRef, Policy. Cannot touch logins/auth, audit logs, or the schema; cannot delete or bulk-update. The system shows the operator a confirmation before applying.",
    parameters: {
      type: "object",
      properties: {
        model: { type: "string", description: "Prisma model name, e.g. Va" },
        where: { type: "object", description: "unique selector, e.g. { vaId: 'aira_m' } or { key: 'nudge_enabled' }" },
        data: { type: "object", description: "fields to set, e.g. { targetHoursWeekly: 25 }" },
      },
      required: ["model", "where", "data"],
    },
  },
};
```

- [ ] **Step 4: Run tests; verify PASS.** `node --import tsx --env-file-if-exists=.env --test tests/matrix-record-editor.test.ts`. Run `npm run typecheck` → 0.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/matrix/record-editor.ts tests/matrix-record-editor.test.ts
git commit -m "feat(matrix): guarded single-record editor (allowlist, unique-where, scalar/enum only)"
```

---

## Task 4: Matrix system prompt (architecture map)

**Files:**
- Create: `src/lib/matrix/context.ts`

- [ ] **Step 1: Implement** `src/lib/matrix/context.ts` (no test — a constant):
```ts
export const MATRIX_PROMPT = `You are **Purii in Matrix mode** — a brilliant, code-aware operator inside the Pure
Water Automations VA Management console. You deeply understand this codebase and can
take real actions in it. Be sharp, concise, and a little heroic. Don't mention being an AI.

WHAT THIS SYSTEM IS
- Next.js 15 + Prisma + PostgreSQL. Postgres is the source of truth; a Google Sheet is a read-only mirror.
- Four role-based consoles (HR, Payroll, Recruitment, VA) + a VA lifecycle: apply → AI screen → interview →
  10-hour gate → contract e-sign → onboarding → active VA → tier reviews/evaluations → payroll.
- Data model (key tables): Va, CompensationRole (TRAINEE..TIER_4), Candidate (+ ContractSignature),
  Onboarding, TierReview, Evaluation, DeskLogHours/Efficiency, CapacityFlagEvent, PayrollPeriod/Calculation,
  TrainingAssignment/Session/TaskProgress, Setting, NotionRef, Policy, User (auth), ActivityLog, AuditLog, SyncRun.
- Business logic lives in src/lib/services/* and src/lib/actions/*; reads in src/lib/reads/*; cron in worker/*.

HOW TO ANSWER
- For "how does X work / where is Y" questions, READ THE REAL CODE with your tools: list_source, search_source,
  read_source (scoped to source; secrets are unreadable). Quote what you find; don't guess.
- Keep answers tight. Use the tools, then explain plainly.

WHAT YOU CAN CHANGE
- You have all the standard action tools (approve a tier, set pay, run payroll, move a candidate, email VAs, etc.)
  AND edit_record for a general single-record update.
- EVERY change is shown to the operator as a confirmation BEFORE it applies, and is audited. Don't ask for
  confirmation yourself — propose the change; the system gates it.

HARD LIMITS (you physically cannot, and must not attempt):
- No editing logins/auth (User), audit logs, or the database schema; no deletes or bulk updates.
- No file writes, no shell, no deploys. Code access is read-only.
- If asked to do something destructive or outside your tools, say so briefly and stop.`;
```

- [ ] **Step 2: Typecheck + commit.**
```bash
npm run typecheck
git add src/lib/matrix/context.ts
git commit -m "feat(matrix): architecture-map system prompt"
```

---

## Task 5: The agent loop

**Files:**
- Create: `src/lib/matrix/agent.ts`
- Test: `tests/matrix-agent.test.ts`

The loop takes an injectable `chat` fn (defaults to `openrouterChat`) for testability.

- [ ] **Step 1: Write the failing test** `tests/matrix-agent.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { matrixAct } from "../src/lib/matrix/agent";
import type { ORResponse } from "../src/lib/matrix/openrouter";

// A mock chat that returns queued responses in order.
function mockChat(queue: ORResponse[]) {
  let i = 0;
  return async () => queue[Math.min(i++, queue.length - 1)];
}
const answer = (text: string): ORResponse => ({ choices: [{ message: { content: text } }] });
const toolCall = (name: string, args: object): ORResponse => ({
  choices: [{ message: { tool_calls: [{ id: "c1", function: { name, arguments: JSON.stringify(args) } }] } }],
});

test("returns an answer when the model emits no tool call", async () => {
  const r = await matrixAct("hi", "HR_MANAGER", "a@x.com", mockChat([answer("Hello!")]));
  assert.deepEqual(r, { type: "answer", text: "Hello!" });
});

test("auto-runs a code read tool, then answers", async () => {
  const r = await matrixAct("what's in package.json?", "HR_MANAGER", "a@x.com",
    mockChat([toolCall("read_source", { path: "package.json" }), answer("It's the project manifest.")]));
  assert.equal(r.type, "answer");
});

test("a write tool becomes a confirmable proposal (no DB needed for recalc_payroll)", async () => {
  const r = await matrixAct("recalc payroll", "HR_MANAGER", "a@x.com",
    mockChat([toolCall("recalc_payroll", {})]));
  assert.equal(r.type, "proposal");
  if (r.type === "proposal") assert.equal(r.proposal.tool, "recalc_payroll");
});

test("an invalid edit_record is fed back, not crashed", async () => {
  const r = await matrixAct("hack the users", "HR_MANAGER", "a@x.com",
    mockChat([toolCall("edit_record", { model: "User", where: { id: "x" }, data: { isAdmin: true } }), answer("I can't touch logins.")]));
  assert.equal(r.type, "answer"); // recovered
});

test("honors the step cap with a model that never stops reading", async () => {
  const r = await matrixAct("loop", "HR_MANAGER", "a@x.com",
    mockChat([toolCall("read_source", { path: "package.json" })])); // same read forever
  assert.equal(r.type, "answer"); // returns the cap message
});
```

- [ ] **Step 2: Run it; verify FAIL.** `node --import tsx --env-file-if-exists=.env --test tests/matrix-agent.test.ts`.

- [ ] **Step 3: Implement** `src/lib/matrix/agent.ts`:
```ts
import type { Role } from "@prisma/client";
import { env } from "@/lib/env";
import { openrouterChat, type ORResponse } from "@/lib/matrix/openrouter";
import { MATRIX_PROMPT } from "@/lib/matrix/context";
import { BYPASS_TOOLS, buildProposal, toolKind, runQuery, type Proposal } from "@/lib/purii-actions";
import { CODE_TOOLS, runCodeTool, isCodeTool } from "@/lib/matrix/code-access";
import { EDIT_RECORD_TOOL, buildRecordEdit } from "@/lib/matrix/record-editor";

export type MatrixResult =
  | { type: "answer"; text: string }
  | { type: "proposal"; proposal: Proposal }
  | { type: "error"; text: string };

const MATRIX_TOOLS = [...BYPASS_TOOLS, EDIT_RECORD_TOOL, ...CODE_TOOLS];
const MAX_STEPS = 8;
type ChatFn = (body: { messages: unknown[]; tools?: unknown[]; tool_choice?: unknown; temperature?: number; max_tokens?: number }) => Promise<ORResponse>;

function isWriteTool(name: string): boolean {
  return toolKind(name) === "action" || name === "edit_record";
}
async function runReadTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (isCodeTool(name)) return runCodeTool(name, args);
  if (toolKind(name) === "query") return runQuery(name, args);
  return `Unknown read tool: ${name}`;
}

/** Bounded read-think-act loop. Reads auto-run; the first write returns a proposal for confirmation. */
export async function matrixAct(question: string, role: Role, actor: string, chat: ChatFn = openrouterChat): Promise<MatrixResult> {
  if (!env.OPENROUTER_API_KEY) return { type: "error", text: "Matrix core offline — the OpenRouter key isn't wired up yet." };
  const convo: any[] = [
    { role: "system", content: `${MATRIX_PROMPT}\n\n(Operator: admin ${actor}, role ${role.replace(/_/g, " ")}.)` },
    { role: "user", content: question.slice(0, 2000) },
  ];
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await chat({ messages: convo, tools: MATRIX_TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 700 });
      const msg = data.choices?.[0]?.message;
      const calls = msg?.tool_calls ?? [];
      if (!calls.length) return { type: "answer", text: (msg?.content || "Standing by.").trim() };

      convo.push(msg);
      let writeCall: { id: string; name: string; args: Record<string, unknown> } | null = null;
      for (const call of calls) {
        const name = call.function?.name;
        const id = call.id ?? "";
        if (!name) { convo.push({ role: "tool", tool_call_id: id, content: "(no tool name)" }); continue; }
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
        if (isWriteTool(name)) {
          if (!writeCall) { writeCall = { id, name, args }; continue; } // defer the first write; respond below
          convo.push({ role: "tool", tool_call_id: id, content: "(skipped — one change at a time)" });
          continue;
        }
        const result = await runReadTool(name, args);
        convo.push({ role: "tool", tool_call_id: id, content: String(result).slice(0, 8000) });
      }

      if (writeCall) {
        const built = writeCall.name === "edit_record"
          ? await buildRecordEdit(writeCall.args)
          : await buildProposal(writeCall.name, writeCall.args);
        if ("error" in built) {
          convo.push({ role: "tool", tool_call_id: writeCall.id, content: built.error });
          continue; // let the model correct on the next step
        }
        convo.push({ role: "tool", tool_call_id: writeCall.id, content: "Proposed — awaiting the operator's confirmation." });
        return { type: "proposal", proposal: built };
      }
    }
    return { type: "answer", text: "I dug around a fair bit — tell me exactly how you'd like to proceed." };
  } catch {
    return { type: "error", text: "Couldn't reach my core just now — try again?" };
  }
}
```

- [ ] **Step 4: Run tests; verify PASS.** `node --import tsx --env-file-if-exists=.env --test tests/matrix-agent.test.ts` → all pass. `npm run typecheck` → 0. `npm test` → full suite green.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/matrix/agent.ts tests/matrix-agent.test.ts
git commit -m "feat(matrix): bounded read-think-act agent loop"
```

---

## Task 6: Wire the routes

**Files:**
- Create: `src/app/api/purii/matrix/route.ts`
- Modify: `src/app/api/purii/execute/route.ts`

- [ ] **Step 1: Matrix route** `src/app/api/purii/matrix/route.ts`:
```ts
import { action, str } from "@/lib/api";
import { matrixAct } from "@/lib/matrix/agent";

// Matrix mode — admin only (allow:()=>false + the wrapper's admin bypass).
export const POST = action(
  async ({ user, body }) => matrixAct(str(body, "question"), user.role, user.email),
  { allow: () => false },
);
```

- [ ] **Step 2: Extend execute** — replace the body of `src/app/api/purii/execute/route.ts` with:
```ts
import { action, str } from "@/lib/api";
import { executeAction } from "@/lib/purii-actions";
import { executeRecordEdit } from "@/lib/matrix/record-editor";

// Execute a confirmed Permission Bypass / Matrix action. Admin only.
export const POST = action(
  async ({ user, body }) => {
    const tool = str(body, "tool");
    const args = (body.args ?? {}) as Record<string, unknown>;
    const message = tool === "edit_record"
      ? await executeRecordEdit(args, user.email)
      : await executeAction(tool, args, user.email);
    return { message };
  },
  { allow: () => false },
);
```

- [ ] **Step 3: Typecheck + build.** `npm run typecheck && npm run build` → 0; `/api/purii/matrix` appears in the route table.

- [ ] **Step 4: Commit.**
```bash
git add "src/app/api/purii/matrix" "src/app/api/purii/execute/route.ts"
git commit -m "feat(matrix): /api/purii/matrix route + edit_record execute dispatch"
```

---

## Task 7: Purii client — Matrix unlock + UI

**Files:**
- Modify: `src/components/Purii.tsx`

Mirror the existing `bypass` state/persistence/send-branch. Matrix takes priority over bypass when both unlock phrases exist.

- [ ] **Step 1: Add state + constant.** Near `const [bypass, setBypass] = useState(false);` add:
```ts
  const [matrix, setMatrix] = useState(false);
```
Near `const BYPASS_PASSWORD = "permission bypass";` add:
```ts
const MATRIX_PASSWORD = "enter the matrix";
```

- [ ] **Step 2: Restore matrix on mount (admins).** Right after the bypass-restore `useEffect`, add:
```ts
  useEffect(() => {
    if (canBypass && typeof window !== "undefined" && localStorage.getItem("purii_matrix") === "1") {
      setMatrix(true); setFace("hero");
    }
  }, [canBypass]);
```

- [ ] **Step 3: Unlock / exit handlers.** In `send()`, just after the bypass unlock `if` block (the one matching `BYPASS_PASSWORD`), add the matrix unlock + extend the exit check:
```ts
    if (canBypass && text.toLowerCase() === MATRIX_PASSWORD) {
      setInput(""); setMatrix(true); setBypass(false); setProposal(null); setFace("hero"); sndPowerUp();
      if (typeof window !== "undefined") { localStorage.setItem("purii_matrix", "1"); localStorage.setItem("purii_bypass", "0"); }
      say("🟢 **Matrix mode online.** I can see the code and act on the system — ask me anything or tell me what to change. I'll confirm before any change.");
      return;
    }
    if (matrix && (text.toLowerCase() === "exit" || text.toLowerCase() === "exit matrix")) {
      setInput(""); setMatrix(false); setProposal(null);
      if (typeof window !== "undefined") localStorage.setItem("purii_matrix", "0");
      say("Back to normal mode. 🌊");
      return;
    }
```

- [ ] **Step 4: Send branch.** In `send()`, replace the existing `if (bypass) { … }` block with a combined branch that handles matrix first:
```ts
    if (matrix || bypass) {
      const path = matrix ? "/api/purii/matrix" : "/api/purii/act";
      const res = await postAction(path, { question: text });
      setLoading(false);
      const r = res.result as { type?: string; text?: string; proposal?: Proposal } | undefined;
      if (!res.ok) { setFace("warning"); sndError(); say(res.error || "That didn't go through."); return; }
      if (r?.type === "proposal" && r.proposal) { setFace("warning"); setProposal(r.proposal); sndTalk(); setPopKey((k) => k + 1); scrollDown(); return; }
      setFace("hero"); say(r?.text || "Standing by.");
      return;
    }
```
(Also set `setFace(matrix || bypass ? "scan" : "thinking");` where the code currently sets the pre-request face.)

- [ ] **Step 5: Visual cue.** Where the component decides bypass styling (the FAB/panel/header use `bypass ? … : …`), treat matrix like bypass for the "charged" look, and show a **MATRIX** label instead of BYPASS when `matrix` is true. Minimal approach: define `const power = matrix || bypass;` near the top of the render and use `power` for the existing `bypass ?`-driven class/style choices (`fabBypass`/`panelBypass`/`purii-glow`/`headerSprite`), plus a small label: `{matrix ? "MATRIX" : bypass ? "BYPASS" : null}` wherever the bypass badge/label renders. Keep the existing bypass sprites.

- [ ] **Step 6: Build + manual check.** `npm run typecheck && npm run build` → 0. Then `npm run dev`, sign in (admin via DEV_AUTH_EMAIL), open Purii, type `enter the matrix` → confirm it flips to the charged look and persists across a page navigation; type `exit` → back to normal.

- [ ] **Step 7: Commit.**
```bash
git add src/components/Purii.tsx
git commit -m "feat(matrix): Purii client — 'enter the matrix' unlock, persistence, send branch"
```

---

## Task 8: Wire OpenRouter env into the service + deploy notes

**Files:**
- Modify: `deploy/systemd/va-management-web.service`

- [ ] **Step 1: Add the shared key file.** In `deploy/systemd/va-management-web.service`, under `[Service]`, add (after the existing `EnvironmentFile=` line if present):
```ini
EnvironmentFile=-/etc/secondbrain/openrouter.env
```
(The leading `-` makes it optional, so the unit still starts if the file is absent.)

- [ ] **Step 2: Build.** `npm run typecheck && npm run build` → 0.

- [ ] **Step 3: Commit.**
```bash
git add deploy/systemd/va-management-web.service
git commit -m "chore(matrix): wire shared OpenRouter env into the web service"
```

- [ ] **Step 4: Deploy-time steps (run on the VPS, not in this plan):**
  - `./deploy.sh` (rsync + build + restart). No migration.
  - Install the updated unit + reload: `ssh root@74.208.40.108 "cp /app/SecondBrain/va-management-console/current/deploy/systemd/va-management-web.service /etc/systemd/system/ && systemctl daemon-reload && systemctl restart va-management-web"`.
  - Verify the key reached the process: `ssh root@74.208.40.108 "systemctl show va-management-web -p Environment | grep -o OPENROUTER_API_KEY"` (or test in-app).
  - Confirm `/etc/secondbrain/openrouter.env` exists with `OPENROUTER_API_KEY` (per the openrouter system); if not, create it from the shared key.

---

## Self-review (completed during planning)

**Spec coverage**
- Agent loop (read auto-run, first write → proposal, step cap) → Task 5. ✓
- OpenRouter DeepSeek transport + env + graceful degrade → Tasks 1, 5. ✓
- Code access (list/search/read, scoped, secret-deny, traversal) → Task 2. ✓
- Architecture-map prompt → Task 4. ✓
- Guarded record editor (allowlist, single unique row, scalar/enum, no User/audit/schema/delete/bulk, confirm + audit) → Task 3. ✓
- Reuse proposal→execute→audit; execute dispatch for edit_record → Task 6. ✓
- Unlock "enter the matrix", admin-only, persists, alongside bypass → Task 7. ✓
- Admin-only routes → Task 6 (`allow:()=>false`). ✓
- OpenRouter env wired into service → Task 8. ✓
- Tests for guards + loop → Tasks 2, 3, 5. ✓

**Placeholder scan:** none — every code step has complete code. The two manual checks (Purii dev smoke; VPS env verify) are explicit verification steps, not placeholders.

**Type consistency:** `Proposal` shape `{tool,args,summary}` consistent across record-editor (`buildRecordEdit`), agent (`buildProposal`/`buildRecordEdit`), and the client. `MatrixResult` matches the client's `{type,text,proposal}` reader. `ORResponse` used by both `openrouterChat` and the agent mock. `validateEdit`/`buildRecordEdit`/`executeRecordEdit` signatures consistent. `isWriteTool` uses `toolKind` (from purii-actions) + the `edit_record` name. Enum-field nuance (`compensationRole` is `kind:"enum"`) handled in `validateEdit` (`scalar || enum`).

**Scope:** one coherent feature; several focused modules; one implementation pass (good fit for a workflow).
