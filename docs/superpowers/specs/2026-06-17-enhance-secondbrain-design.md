# Enhance with Second Brain — Design

**Date:** 2026-06-17
**Status:** Approved design, ready for implementation plan
**Feature flag:** beta (button visible to project managers only)

## Summary

A beta feature on the VA Management Console's project detail page. A supervisor
(HR_MANAGER / TEAM_LEAD / Admin — anyone who can edit the project) clicks
**"Enhance with Second Brain"**. The app searches the SecondBrain mirrors (Notion,
Drive, meeting transcripts) for context related to the project, uses OpenRouter to
synthesize that context into (a) a context summary and (b) suggested tasks, and
shows a confirmation modal. The reviewer accepts or skips each context piece and
each suggested task (setting assignee + due date per task) before anything is
written. On confirm, accepted context is appended to the project description and
accepted tasks are created.

**Example:** Aira opens "NE Website Refresh" → clicks Enhance → the modal streams in
a Notion brief, a Drive doc, and a meeting-call snippet, plus 3–4 suggested tasks →
Aira accepts the brief + two tasks, sets their assignees and due dates, confirms →
the description gains a "Context (from Second Brain)" block and two new tasks appear
on the project.

## Goals / Non-goals

**Goals**
- One-click context enrichment + task suggestions grounded in real SecondBrain data.
- Human-in-the-loop: nothing is written until the reviewer confirms per-item.
- Reuse existing infrastructure (OpenRouter helper, `createTask`, `updateProject`).
- Stream results so the modal feels alive (~3–8s total search + synthesis).

**Non-goals (beta)**
- No new persisted "enhancement" entity or history — it's a transient assist.
- No semantic/vector search tuning — use the MCP's existing search tools as-is.
- No editing of the suggested task title/instructions in the modal (assignee + due
  date only; deeper edits happen on the task after creation).
- No automatic re-run / scheduling. Manual button only.

## Architecture

```
[Project detail page  /hr/projects/[id]]
  └─ "Enhance with Second Brain" button (gated on canEdit — same guard as Edit)
       └─ opens EnhanceModal immediately (skeleton state)
            └─ POST /api/hr/projects/[id]/enhance        (SSE stream)
                 ├─ auth: getCurrentUser() + canUserDelegateProjects guard
                 ├─ read project {name, description, client, type}
                 ├─ build one query string from name + description + client
                 ├─ SecondBrain MCP (http://localhost:8787/mcp), 3 tools in parallel:
                 │     search_notion_mirror, search_drive_index, search_meetings
                 │     → stream each normalized result as `event: context`
                 ├─ OpenRouter synthesis (openrouterChat): project + snippets → JSON
                 │     {contextSummary, tasks:[{title,instructions,priority}]}
                 │     → `event: tasks`
                 └─ `event: done`  (or `event: error` per-source, non-fatal)

[Reviewer interacts with modal]
  ├─ accept / skip each context card
  ├─ expand task card → set assignee (<select>) + due date
  └─ "Confirm selected":
       POST /api/hr/projects/[id]/enhance/apply        (plain JSON, action())
         ├─ append accepted context → project.description (updateProject)
         └─ createTask × N  (assignee + dueDate + projectId + source link)
```

### New files
- `src/lib/secondbrain/client.ts` — MCP client wrapping the official
  `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport` (the same
  SDK the SecondBrain server uses; the chatgpt-app AGENTS doc ships the exact verify
  snippet). Connects, calls each tool via `callTool`, and a **pure exported**
  `normalizeToolResult(toolName, result)` flattens the MCP `content[]` text blocks
  into `{ source, title, snippet, link }[]`. Hand-rolling the Streamable-HTTP
  session handshake + SSE parsing was rejected as too risky/untestable for a beta.
- `src/lib/secondbrain/enhance.ts` — orchestration: query construction, parallel
  tool calls, OpenRouter synthesis prompt + JSON validation, the
  append-to-description merge helper.
- `src/app/api/hr/projects/[id]/enhance/route.ts` — SSE stream endpoint.
- `src/app/api/hr/projects/[id]/enhance/apply/route.ts` — confirm endpoint (`action()`).
- `src/components/projects/EnhanceModal.tsx` — the modal UI.
- Button added to `src/app/(app)/hr/projects/[id]/page.tsx` header (gated on `canEdit`).

### No DB migration
Reuses `updateProject` (description field) and `createTask`. No schema change.

## Data flow detail

### MCP client (`secondbrain/client.ts`)
The SecondBrain cloud MCP at `http://localhost:8787/mcp` (co-located on the same VPS
as this app) speaks Streamable-HTTP MCP. The client uses the official SDK:
1. `new Client(...)` + `new StreamableHTTPClientTransport(new URL(MCP_URL))`, then
   `client.connect(transport)` — the SDK handles the `initialize` handshake, session
   id, and SSE response framing.
2. For each search tool, `client.callTool({ name, arguments: { query } })`.
3. `normalizeToolResult(toolName, result)` (pure, exported, unit-tested) flattens the
   returned `content[]` text blocks into `SbResult[]`. Best-effort: a tool that errors
   or returns an unparseable payload yields `[]` (non-fatal). `client.close()` in a
   `finally`.

Endpoint base is `env.SECONDBRAIN_MCP_URL` (default `http://localhost:8787/mcp`),
added to `src/lib/env.ts` as `optionalEnvString`. New dependency:
`@modelcontextprotocol/sdk` (small; not the `googleapis` mega-package the AGENTS doc
warns against).

### Query construction
`query = [project.name, project.client, firstSentence(project.description)].filter(Boolean).join(" ")`.
A single query string fans out to all three tools concurrently (`Promise.allSettled`).

### Synthesis (`openrouterChat`)
One call. System prompt: *"You enrich a work project. Given the project and snippets
found in the team's knowledge base, return STRICT JSON `{contextSummary, tasks}`.
Ground every task in the snippets — never invent client names, dates, URLs, or
specifics not present. If the snippets are thin, return fewer tasks or none."*
`temperature: 0.2`, `max_tokens` bounded. Response parsed + zod-validated; on invalid
JSON, `tasks: []` and a soft notice (context cards already rendered).

### Streaming envelope (SSE)
- `event: context` data `{id, source, title, snippet, link}` — one per found item.
- `event: tasks` data `{contextSummary, tasks:[{id, title, instructions, priority}]}`.
- `event: error` data `{source, message}` — non-fatal, shown as inline notice.
- `event: done` — closes the stream.

The route returns a `ReadableStream` `Response` with
`Content-Type: text/event-stream`. It does **not** use the `action()` wrapper (that
wrapper returns JSON); it performs `getCurrentUser()` + the role guard manually, then
streams. `runWithActor` wraps the work so activity logging keeps the actor.

### Confirm / apply
`POST .../enhance/apply` uses the `action()` wrapper (identity + audit + JSON). The
role guard runs **inside** the handler via `await canUserDelegateProjects(user.id, user.role)`
— not the wrapper's `allow` option, because `allow` is a synchronous `(role)=>boolean`
predicate and the delegation check is async and needs the actor id (same pattern as
`createProject`/`updateProject`). On failure it throws `AuthorizationError` (→ 403).
Body: `{ acceptedContext: ContextCard[], acceptedTasks: {id,title,instructions,priority,assignedToId,dueDate,link}[] }`.
- **Description merge** (pure, unit-tested): append a single
  `## Context (from Second Brain)` markdown block built from the accepted cards to
  the existing description. Never overwrite; if the heading already exists, append a
  dated sub-section so repeat runs don't clobber prior context.
- **Tasks**: `createTask` per accepted task with `projectId`, `assignedToId`,
  `dueDate`, `links: card.link`. Per-task try/catch — one failure is reported but
  does not roll back the others or the description merge.

## Authorization
Same guard as project editing: the SSE route and the apply route both require
`canUserDelegateProjects(actorId, role)` (the function already gating
`createProject`/`updateProject`). The page only renders the button when `canEdit` is
true, so UI and server agree. Admins bypass via the existing `isAdmin` path.

## Error handling
- **One MCP tool fails** → other tools' results still stream; an `error` event for the
  failed source shows a dismissible inline notice. Never hard-fails.
- **MCP entirely unreachable** → all three error events; modal shows "Second Brain is
  unavailable right now" with a Close button. No throw to the user.
- **Synthesis fails / returns junk** → context cards remain; task column shows
  "Couldn't generate task suggestions — you can still accept context."
- **Empty results** → empty state ("Second Brain didn't find related context"), Close.
- **Confirm partial failure** → per-task reporting; modal lists which tasks were
  created and which failed; description merge is independent.
- **OpenRouter key absent** (`OPENROUTER_API_KEY` unset) → context still searches +
  streams; synthesis step is skipped with the soft task notice.

## Components
`EnhanceModal.tsx` — full-screen modal overlay, opens instantly on click.
- Two columns: **Context found** (left), **Suggested tasks** (right).
- Skeleton placeholders until the stream fills them; consumes SSE via a `fetch`
  reader (POST body needed, so not `EventSource`).
- Context cards: title + source icon + snippet + Accept/Skip toggle.
- Task cards: collapsed = title + Add/Skip; expanded = assignee `<select>` (team
  members passed as a prop from the page) + due-date `<input type=date>`.
- Footer: "Confirm selected" (count) + "Cancel". Local React state tracks
  accept/skip + per-task assignee/due-date. On confirm, POSTs to `.../apply`,
  shows result, refreshes the project (router refresh) and closes.

## Testing
Node test runner (matches the existing 22-test suite). Pure logic is unit-tested;
SSE/route/modal verified by manual smoke on the VPS.
- `secondbrain/client.ts` — the pure `normalizeToolResult` function (well-formed
  content → `SbResult[]`; malformed/empty payload → `[]`; error result → `[]`). The
  SDK connection itself is integration-verified by the VPS smoke step, not unit-tested.
- `secondbrain/enhance.ts` — query construction; synthesis JSON parse + zod
  validation incl. the "junk JSON → tasks:[]" fallback (mocked `openrouterChat`).
- description-merge helper — existing description preserved; heading added once;
  repeat run appends a dated sub-section rather than duplicating.
- apply-path input validation — bad assignee/date handled like `createTask` already does.

## Env additions
- `SECONDBRAIN_MCP_URL` — optional, default `http://localhost:8787/mcp`.
- (Existing) `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MATRIX_MODEL`
  already present — reused for synthesis.

## Rollout
Beta: button gated on `canEdit`, no separate flag needed initially. If we want to
hide it entirely during testing, a single `ENHANCE_SECONDBRAIN_ENABLED` env check on
the page + routes can gate it (deferred unless wanted).
