# Purii "Matrix mode" — design

- Date: 2026-06-16
- Status: approved (pending spec review)
- Scope: a new, smarter, code-aware admin tier of Purii

## Context

Purii already has two tiers (`src/lib/purii.ts`, `src/lib/purii-actions.ts`, `src/components/Purii.tsx`):

1. **Ask mode** — answers "how do I…" questions from a static console guide (OpenAI gpt-4o-mini).
2. **Permission Bypass mode** — admin-only agentic mode unlocked with `permission bypass`. A registry of ~25 validated **tools** (`action` = build proposal → confirm → exec; `query` = read-only, runs immediately). Single-shot: one model call → one proposed action. Every write is confirmed + audited (`bypass.*`). Driven by OpenAI gpt-4o-mini tool-calling.

Justin wants a **third, more capable tier** that actually understands the codebase and can do "almost anything" with data — while being unable to destroy the system.

## Goals

- A new admin-only mode unlocked with **"Enter the Matrix"**, kept **alongside** Permission Bypass.
- Runs on a **more capable but cheap** model: **DeepSeek v3.1 via OpenRouter** (the shared key).
- **Reads the actual source code** to answer deep questions precisely.
- **Edits data** via the existing validated tools **plus** a new guarded general record editor.
- **Cannot destroy the system**: no file writes, no shell, no deletes/bulk/schema, no secret reads, no auth edits — every write confirmed + audited.

## Non-goals

- Replacing Permission Bypass (it stays).
- Writing code / running migrations / deploying / executing arbitrary shell.
- A semantic (embedding) code index — live file reads are enough.
- Multi-record / bulk data operations.

## Locked decisions

1. **Code access:** a baked-in architecture map **+ live source reading** (3 read tools), scoped to source, never secrets.
2. **Edit power:** the existing safe tools **+ a guarded single-record editor** (allowlisted business tables, update-only, confirmed + audited).
3. **Model:** `deepseek/deepseek-chat-v3.1` via OpenRouter, env-configurable.
4. **Mode:** a new tier alongside Permission Bypass.

## Architecture

### The agent loop (the core change)

Bypass is single-shot. Matrix runs a **bounded read-think-act loop** server-side, within one request:

```
matrixAct(messages, role, actor) -> { type:"answer", text } | { type:"proposal", proposal }

convo = [system: MATRIX_PROMPT, ...messages]      // messages = the chat history (final answers only)
for step in 0..MAX_STEPS (default 8):
  resp = openrouterChat({ model, messages: convo, tools: MATRIX_TOOLS, tool_choice:"auto" })
  msg  = resp.choices[0].message
  if no tool_calls:            return { type:"answer", text: msg.content }
  convo.push(msg)
  for call in msg.tool_calls:
    if isWriteTool(call):                          // action tool OR edit_record
      built = await buildWrite(name, args)
      if built.error: convo.push(tool result = built.error); continue   // let the model recover
      return { type:"proposal", proposal: built }  // STOP — needs human confirmation
    else:                                          // read/query/code tool
      result = await runReadTool(name, args)
      convo.push({ role:"tool", tool_call_id: call.id, content: result })
return { type:"answer", text: "(hit the step cap) …" }
```

- **Read/query/code tools auto-run** and feed back into the model (multiple round-trips, all within one `matrixAct` call). Intermediate tool results live only inside the loop — the client's history holds only user messages + final answers.
- The **first write** the model emits stops the loop and returns a proposal for confirmation (same shape as today's `BypassResult`).
- `MAX_STEPS` (8) + `max_tokens` bound cost (OpenRouter is pay-per-token).

### Model + transport

New `src/lib/matrix/openrouter.ts`:
```ts
export async function openrouterChat(body: {
  messages: unknown[]; tools?: unknown[]; tool_choice?: unknown; temperature?: number; max_tokens?: number;
}): Promise<OpenAIChatResponse>
```
- POSTs `${OPENROUTER_BASE_URL}/chat/completions` with `Authorization: Bearer ${OPENROUTER_API_KEY}`, `model = OPENROUTER_MATRIX_MODEL`.
- OpenAI-compatible, so the existing tool-call format works unchanged.
- `src/lib/env.ts` adds (all optional): `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`), `OPENROUTER_MATRIX_MODEL` (default `deepseek/deepseek-chat-v3.1`).
- If `OPENROUTER_API_KEY` is missing, Matrix degrades gracefully ("Matrix mode needs the OpenRouter key configured").

### Codebase access — read-only, scoped, secret-safe

New `src/lib/matrix/code-access.ts`, three tools the model may call freely:
- `list_source(dir)` — list files/dirs under an allowed path.
- `search_source(query)` — grep-like search across allowed dirs; returns up to N `file:line: snippet` hits (JS walk, no shell spawn).
- `read_source(path)` — return a file's contents, truncated to ~16 KB.

`safePath(p)` enforces, for every call:
- Resolves under `process.cwd()`; rejects anything escaping the root (traversal).
- First path segment ∈ **allow** = `src/`, `prisma/`, `worker/`, `tests/`, `scripts/`; or file ∈ `package.json`, `tsconfig.json`, `AGENTS.md`, `README.md`.
- **Deny** (always rejected, even inside allowed dirs): matches `/\.env/`, `/\.secrets/`, `/secret/i`, `/token/i`, `/credential/i`, `/service-account/i`, `/\.(pem|key)$/`, `node_modules/`, `.next/`, `.git/`.

So Matrix can read its own app source but never `.env`, the Google token file, the service-account JSON, etc. (Accepted caveat: file contents she reads are sent to OpenRouter/DeepSeek.)

### Architecture-map context

New `src/lib/matrix/context.ts` exports `MATRIX_PROMPT` — a curated system prompt:
- The data model (key tables + important fields), the console/action/service layout, the automation workers, the role/permission model, and the "Postgres is source of truth / Sheet is a mirror" rules.
- Instructions: use `list/search/read_source` to answer precisely from real code; you have the action tools + `edit_record` for changes; the system shows the user a confirmation before any write; never attempt anything destructive or outside your tools; be concise.

### Guarded record editor

New `src/lib/matrix/record-editor.ts` adds one write tool, `edit_record`:
```
edit_record(model: string, where: object, data: object)
```
Guards (build-time, before any proposal is shown):
- **Model allowlist** (`ALLOWED_MODELS`): `Va, Candidate, CompensationRole, Setting, Onboarding, TierReview, Evaluation, DeskLogHours, DeskLogEfficiency, CapacityFlagEvent, TrainingAssignment, TrainingSession, TrainingTaskProgress, PayrollPeriod, PayrollCalculation, NotionRef, Policy`. Everything else (esp. `User`, `AuditLog`, `ActivityLog`, `SyncRun`, `ContractSignature`, `_prisma_migrations`) is **rejected**.
- **Single record only:** `where` must uniquely identify one row — validated against the model's `@id`/`@unique` fields via `Prisma.dmmf.datamodel.models`. Non-unique `where` → rejected (no bulk).
- **Update-only:** no delete, no create, no DDL. (Creates use the existing specific tools.)
- **Field validation:** each `data` key must be a **scalar, non-id** field of that model (checked via DMMF `kind === "scalar"` && `!isId`); relation fields and `id`/`createdAt` are rejected.
- **Proposal:** fetch the current row, render a human-readable **diff** (`field: old → new`) for confirmation.
- **Exec:** model names map to Prisma delegates by lower-casing the first letter (`Va` → `db.va`, `CompensationRole` → `db.compensationRole`); run `(db as Record<string, any>)[delegate].update({ where, data })`, then `audit({ action:"bypass.edit_record", … , details:{ matrix:true, model, where, data } })` + an `ActivityLog`.

### Reuse of the existing machinery

- The **proposal → confirm → execute** UI and the `/api/purii/execute` route are reused. `execute` dispatches: `tool === "edit_record"` → `executeRecordEdit`; otherwise → the existing `executeAction`.
- Matrix's write toolset = the existing `BYPASS_TOOLS` (action + query defs) **+** the `edit_record` def **+** the three code-access defs.
- `isWriteTool(name)` = `toolKind(name) === "action" || name === "edit_record"`.
- `runReadTool(name, args)` routes query tools → `runQuery`, code tools → code-access.

### Unlock & UI (`src/components/Purii.tsx`)

- New unlock phrase constant `MATRIX_PASSWORD = "enter the matrix"` (admins only, like bypass). New `matrix` state, persisted in `localStorage` (`purii_matrix`) like the just-added bypass persistence; `exit` leaves it.
- When `matrix` is on, send chat to **`/api/purii/matrix`** (instead of `/api/purii/act`); render `answer`/`proposal` results with the existing components; confirmed proposals POST to `/api/purii/execute` as today.
- Distinct visual: reuse the bypass "charged" treatment, restyled green/Matrix (sprites optional — can reuse bypass sprites initially). A small "MATRIX" label distinguishes it from "BYPASS".

### New API route

`src/app/api/purii/matrix/route.ts` — `POST`, admin-enforced (`action(..., { allow: () => false })`, admins bypass), body `{ messages }`, calls `matrixAct(messages, user.role, user.email)`, returns `{ ok, result }` where result is `{ type:"answer"|"proposal", … }`. Mirrors `/api/purii/act`.

## Safety boundaries (explicit "can't destroy the system")

- No file writes; code access is read-only.
- No shell / arbitrary commands. (`run_worker` stays a fixed allowlist tool; not generalized.)
- `edit_record`: allowlisted business tables only, single unique row, update-only, scalar non-id fields, no `User`/auth/audit/migrations.
- No secret reads (path deny-list).
- Every write confirmed by the admin + audited (`bypass.*` / `matrix:true`).
- Admin-only, server-enforced on `/api/purii/matrix` and `/api/purii/execute`.
- `MAX_STEPS` + `max_tokens` caps (runaway + cost protection).

## Data flow

1. Admin types `enter the matrix` → client flips to Matrix mode (persisted).
2. Admin asks something → `POST /api/purii/matrix { messages }`.
3. `matrixAct` loops: model reads code / runs queries (auto) until it answers **or** proposes a write.
4. Answer → rendered. Proposal → confirmation card.
5. On confirm → `POST /api/purii/execute { tool, args }` → `executeRecordEdit` or `executeAction` → audited result.

## Error handling

- Missing OpenRouter key → friendly "not configured" message (no crash).
- Read-tool guard violation → returns an error string into the loop; the model recovers or explains.
- Write build error (bad model/field/non-unique where) → error fed back; model corrects or reports.
- OpenRouter API error / timeout → "I had trouble thinking just now" (like ask mode).
- All `edit_record` execs run in a try/catch; failures return a clear message, nothing partially applied (single `update`).

## Cost control

- `MAX_STEPS = 8`, `max_tokens ≈ 700`, `read_source` truncates to ~16 KB, `search_source` caps hits.
- DeepSeek v3.1 ≈ $0.2–0.8 / M tokens; a typical interaction is a few cents. OpenRouter credit cap remains the backstop.

## Deploy steps

- Wire the shared key into the service: add `EnvironmentFile=-/etc/secondbrain/openrouter.env` to `va-management-web.service` (deploy/systemd), `daemon-reload`, restart. (`-` = optional, so it doesn't fail if absent.)
- No DB migration (no schema change). No new settings required (model is env-configurable).

## Testing (`tests/*.test.ts`, node runner)

- `matrix-codeaccess.test.ts` — `safePath` allows `src/lib/...`, rejects `../`, `.env`, `.secrets/x`, a `*token*` file, `node_modules/...`; `read_source` truncates.
- `matrix-record-editor.test.ts` — build rejects a non-allowlisted model (`User`), a non-unique `where`, a relation/`id` field; accepts a valid single-row scalar update and renders a diff (mocked db + DMMF).
- `matrix-agent.test.ts` — loop returns `answer` when the (mocked) model emits no tool call; auto-runs a read tool and loops; returns a `proposal` (and stops) on a write tool; honors `MAX_STEPS`.
- Reuse the `--env-file-if-exists` test setup.

## Out of scope / future

- Matrix sprites/sound polish (reuse bypass assets first).
- Embedding/semantic code index.
- Letting Matrix create arbitrary records or run workers beyond the existing allowlist.
- Conversation memory of intermediate reads across turns.
