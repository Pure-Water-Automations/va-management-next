# Zoom Transcript → Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An AI worker reads harvested Zoom transcripts, extracts proposed action items, and queues them in a new "Meeting Actions" tab where a team lead confirms each into a real Task (reusing `createTask`) or skips it.

**Architecture:** A systemd one-shot timer runs `worker/transcript-to-tasks.ts` hourly at `:15` (after the harvester writes `Meetings/*.md` at `:00`). The worker filters in-scope transcripts, sends each to OpenRouter for a strict-JSON list of items, and writes `MeetingAction` + `MeetingActionItem` rows (the `meetingFile @unique` path is the idempotency cursor). A new `/meeting-actions` page (server component) lists pending meetings for `HR_MANAGER`/`TEAM_LEAD`/`SENIOR_VA`; confirm/skip POST routes mutate items and cascade the parent to `RESOLVED`. Confirm calls the existing `createTask`, so the assignment email + `ActivityLog` fire identically.

**Tech Stack:** Next.js 15 (App Router), Prisma + PostgreSQL (`va_console`), `tsx` workers under systemd, OpenRouter (`google/gemini-2.5-flash-lite`) via the existing `src/lib/matrix/openrouter.ts`, `node:test` unit tests.

---

## Reference patterns (read before starting)

- **Worker shape + `SyncRun` bookkeeping:** `worker/recordings-process.ts`. Workers run via `node_modules/.bin/tsx worker/X.ts` (NOT compiled `dist/`).
- **Closest analog feature (scan → AI proposals → confirm into tasks):** `src/lib/secondbrain/discover.ts` + `src/app/api/hr/projects/discover/apply/route.ts`.
- **`createTask(actorId, actorRole, input)`:** `src/lib/actions/tasks.ts:100`. Returns `{...task, emailSent}`. Relevant input fields: `title`, `instructions`, `assignedToId` (a **User.id**), `dueDate`, `client`, `priority`.
- **Role helpers:** `src/lib/auth/roles.ts` (`canManageTasks`, `viewForRole`). `HR_MANAGER`/`TEAM_LEAD` → "HR" view; `SENIOR_VA` → "VA" view — so the nav entry spans two views and is rendered as a dedicated gated Sidebar block.
- **API `action()` wrapper / manual handler + `runWithActor`:** `src/lib/api.ts`, `src/app/api/recordings/review/route.ts`, `src/app/api/hr/projects/discover/apply/route.ts`.
- **Next 15 dynamic route params are a Promise:** `src/app/api/client/requests/[id]/route.ts` (`{ params }: { params: Promise<{ id: string }> }`, `const { id } = await params;`).
- **OpenRouter client:** `src/lib/matrix/openrouter.ts` — `openrouterChat({ messages, temperature?, max_tokens?, model? })`, throws if no key. Reads `env.OPENROUTER_API_KEY` (already in `src/lib/env.ts`).

## Real-data facts (verified against `/Users/justinokamoto/SecondBrain/Meetings/`, 2026-06-20)

- Frontmatter keys are `title`, `zoom_account`, and a date in **either** `recording_start` (Zoom-API transcripts) **or** `meeting_date` (Gmail-harvested Zoom AI summaries). There is **no** `attendees`/`meetingTitle`/`meetingDate` key — the spec's field names were assumptions; this plan uses the real ones.
- `zoom_account` distribution: `Northeast` (69), `Business (BFC)` (39), `PWA` (5), `PWA OS` (1). Per the approved spec, in-scope = `Northeast` + `Business (BFC)`. `PWA`/`PWA OS` are intentionally out-of-scope for v1; the worker logs how many it skips (non-silent) and widening is a one-line constant change.
- `meetings_index.md` has no frontmatter and must be skipped.

## Deviations from the spec (intentional, with rationale)

1. **systemd `ExecStart` uses `tsx`, not `node dist/...`.** Every existing worker runs via `node_modules/.bin/tsx worker/X.ts`; there is no `dist/` build step. The spec's `node dist/worker/...js` would not exist.
2. **No separate `GET /api/meeting-actions`.** The `/meeting-actions` page is a server component that reads the DB directly (the app's idiom — see every `(app)` page). Mutations use the confirm/skip POST routes + `router.refresh()`, exactly like the discover/enhance features. This satisfies spec checklist item 6's read requirement without a redundant endpoint.
3. **Confirm body uses `assigneeId` (a User.id), not `assigneeEmail`.** `createTask` requires `assignedToId` = `User.id`; the dropdown supplies it.
4. **Frontmatter fields** corrected to `title`/`zoom_account`/`recording_start`‖`meeting_date` (see above).

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `MeetingAction` + `MeetingActionItem` models + 2 enums |
| `src/lib/meetings/extract.ts` (create) | **Pure**: frontmatter parse, scope filter, prompt build, strict-JSON validation |
| `src/lib/services/meeting-actions.ts` (create) | **Pure**: `allItemsResolved`, `matchAssignee` |
| `worker/transcript-to-tasks.ts` (create) | **Impure**: read dir, dedupe vs DB, LLM call, write rows, `SyncRun` |
| `src/lib/actions/meeting-actions.ts` (create) | Confirm/skip orchestration (calls `createTask`, cascades parent) |
| `src/app/api/meeting-actions/[id]/confirm/route.ts` (create) | POST confirm one item |
| `src/app/api/meeting-actions/[id]/skip/route.ts` (create) | POST skip one item / all |
| `src/app/(app)/meeting-actions/page.tsx` (create) | Server component: load pending meetings + assignees |
| `src/components/MeetingActionsClient.tsx` (create) | Client UI: cards, per-item confirm/skip, confirm-all/skip-all |
| `src/lib/auth/roles.ts` (modify) | `canReviewMeetingActions(role)` |
| `src/components/Sidebar.tsx` (modify) | Gated "Meeting Actions" nav block + badge |
| `src/app/(app)/layout.tsx` (modify) | Compute `showMeetingActions` + pending count, pass to Sidebar |
| `deploy/systemd/va-management-transcript.{service,timer}` (create) | Hourly `:15` one-shot |
| `package.json` (modify) | `worker:transcript` script |
| `tests/meeting-extract.test.ts` (create) | Unit tests for `extract.ts` |
| `tests/meeting-actions.test.ts` (create) | Unit tests for `services/meeting-actions.ts` |

---

## Task 1: Data model

**Files:**
- Modify: `prisma/schema.prisma` (append after the `Task`/`TaskComment` block, in the "Projects & Task Management" section, e.g. after line 871)

- [ ] **Step 1: Add the models + enums**

Append to `prisma/schema.prisma`:

```prisma
// ── Meeting Actions (Zoom transcript → tasks) ─────────────────────────────
// AI-extracted action items from harvested Zoom transcripts, queued for a team
// lead to confirm into real Tasks. `meetingFile` is the idempotency cursor: any
// Meetings/*.md path not present here is unprocessed.

enum MeetingActionStatus {
  PENDING
  RESOLVED
}

enum MeetingActionItemStatus {
  PENDING
  CONFIRMED
  SKIPPED
}

model MeetingAction {
  id           String              @id @default(cuid())
  meetingFile  String              @unique
  meetingTitle String
  meetingDate  DateTime?
  zoomAccount  String?
  status       MeetingActionStatus @default(PENDING)
  items        MeetingActionItem[]
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  @@index([status])
}

model MeetingActionItem {
  id                String                  @id @default(cuid())
  meetingActionId   String
  title             String
  description       String?
  suggestedAssignee String?
  suggestedDueDate  DateTime?
  clientContext     String?
  status            MeetingActionItemStatus @default(PENDING)
  taskId            String?                 // soft ref to Task.id (no FK, by design)
  resolvedBy        String?                 // email of who confirmed/skipped
  resolvedAt        DateTime?
  createdAt         DateTime                @default(now())

  meetingAction MeetingAction @relation(fields: [meetingActionId], references: [id], onDelete: Cascade)

  @@index([meetingActionId])
  @@index([status])
}
```

- [ ] **Step 2: Create the migration locally**

Run: `npm run prisma:dev -- --name meeting_actions`
Expected: Prisma prints `Applying migration ...meeting_actions`, creates `prisma/migrations/<ts>_meeting_actions/migration.sql`, then `✔ Generated Prisma Client`.

- [ ] **Step 3: Verify the client typechecks against the new models**

Run: `npm run typecheck`
Expected: exits 0 (the generated client now exports `MeetingAction`, `MeetingActionItem`, `MeetingActionStatus`, `MeetingActionItemStatus`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(meeting-actions): add MeetingAction + MeetingActionItem models"
```

---

## Task 2: Pure transcript-extraction library

**Files:**
- Create: `src/lib/meetings/extract.ts`
- Test: `tests/meeting-extract.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/meeting-extract.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  parseMeetingFile,
  shouldProcess,
  parseExtractedItems,
  buildExtractionMessages,
} from "../src/lib/meetings/extract";

const SAMPLE = `---
title: "Aira & Oakwood Check-in"
zoom_account: "Northeast"
recording_start: "2026-06-19T23:58:27Z"
harvested_at: "2026-06-20T01:37:42.039Z"
---

# Aira & Oakwood Check-in

## Transcript

**[00:58] Aira:** "We'll send the proposal Friday."`;

test("parseMeetingFile: pulls title, account, date, body", () => {
  const m = parseMeetingFile(SAMPLE);
  assert.equal(m.title, "Aira & Oakwood Check-in");
  assert.equal(m.zoomAccount, "Northeast");
  assert.equal(m.date?.toISOString(), "2026-06-19T23:58:27.000Z");
  assert.match(m.body, /Transcript/);
  assert.doesNotMatch(m.body, /zoom_account/); // frontmatter stripped
});

test("parseMeetingFile: falls back to meeting_date when no recording_start", () => {
  const md = `---\ntitle: "X"\nzoom_account: "Business (BFC)"\nmeeting_date: "2026-05-01"\n---\nbody`;
  const m = parseMeetingFile(md);
  assert.equal(m.date?.toISOString().slice(0, 10), "2026-05-01");
});

test("parseMeetingFile: missing frontmatter → empty meta, body intact", () => {
  const m = parseMeetingFile("no frontmatter here");
  assert.equal(m.title, "");
  assert.equal(m.zoomAccount, null);
  assert.equal(m.date, null);
  assert.equal(m.body, "no frontmatter here");
});

test("shouldProcess: in-scope account passes", () => {
  assert.equal(shouldProcess({ zoomAccount: "Northeast", title: "Client Sync" }), true);
  assert.equal(shouldProcess({ zoomAccount: "Business (BFC)", title: "X" }), true);
});

test("shouldProcess: out-of-scope account rejected", () => {
  assert.equal(shouldProcess({ zoomAccount: "PWA", title: "X" }), false);
  assert.equal(shouldProcess({ zoomAccount: null, title: "X" }), false);
});

test("shouldProcess: excluded titles rejected even when account is in scope", () => {
  assert.equal(shouldProcess({ zoomAccount: "Northeast", title: "NE PWA Projects" }), false);
  assert.equal(shouldProcess({ zoomAccount: "Northeast", title: "FGS Video Review" }), false);
});

test("parseExtractedItems: valid array parses + validates", () => {
  const out = parseExtractedItems(
    '[{"title":"Send proposal","description":"by Fri","suggestedAssignee":"Aira","suggestedDueDate":"2026-06-27","clientContext":"Oakwood"}]',
  );
  assert.equal(out?.length, 1);
  assert.equal(out?.[0].title, "Send proposal");
  assert.equal(out?.[0].suggestedDueDate, "2026-06-27");
});

test("parseExtractedItems: strips a ```json fence", () => {
  const out = parseExtractedItems('```json\n[{"title":"Do thing"}]\n```');
  assert.equal(out?.length, 1);
  assert.equal(out?.[0].title, "Do thing");
});

test("parseExtractedItems: empty array is valid (not null)", () => {
  assert.deepEqual(parseExtractedItems("[]"), []);
});

test("parseExtractedItems: malformed JSON → null (signals retry)", () => {
  assert.equal(parseExtractedItems("not json at all"), null);
  assert.equal(parseExtractedItems('[{"title": '), null);
});

test("parseExtractedItems: drops items without a title + bad dates", () => {
  const out = parseExtractedItems('[{"description":"no title"},{"title":"Keep","suggestedDueDate":"someday"}]');
  assert.equal(out?.length, 1);
  assert.equal(out?.[0].title, "Keep");
  assert.equal(out?.[0].suggestedDueDate, undefined); // "someday" rejected
});

test("buildExtractionMessages: includes header + transcript, truncates long bodies", () => {
  const meta = parseMeetingFile(SAMPLE);
  const msgs = buildExtractionMessages({ ...meta, body: "x".repeat(30000) }, 100);
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[1].content, /MEETING: Aira & Oakwood Check-in/);
  assert.match(msgs[1].content, /truncated/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/meeting-extract.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/meetings/extract'`.

- [ ] **Step 3: Implement the library**

Create `src/lib/meetings/extract.ts`:

```ts
// Pure, dependency-free helpers for turning a harvested Zoom transcript Markdown
// file into a strict list of proposed action items. No DB, no network, no fs —
// all unit-testable. The worker supplies file contents + the LLM call; this
// module parses, filters, and validates. (Per the local-AI-gateway routing
// guide: keep the cross-cutting reasoning — frontmatter parse + strict JSON
// validation — in code, not the model.)

export type MeetingMeta = {
  title: string;
  zoomAccount: string | null;
  date: Date | null;
  body: string;
};

export type ProposedItem = {
  title: string;
  description?: string;
  suggestedAssignee?: string;
  suggestedDueDate?: string; // YYYY-MM-DD as returned by the model
  clientContext?: string;
};

// In-scope accounts (per the approved spec). PWA / PWA OS transcripts also exist
// in the mirror but are out-of-scope for v1; add them here to widen coverage.
export const ALLOWED_ACCOUNTS = new Set(["Northeast", "Business (BFC)"]);

// Meetings that are NOT Justin's (harvester attribution notes):
// FGS Video review = Zawadi; NE PWA Projects = Zawadi + Aira.
export const EXCLUDED_TITLE_PATTERNS = [/fgs video review/i, /ne pwa projects/i];

/** Parse flat YAML frontmatter + body from a harvested Meetings/*.md file. */
export function parseMeetingFile(md: string): MeetingMeta {
  let title = "";
  let zoomAccount: string | null = null;
  let dateStr: string | undefined;
  let body = md;

  const fm = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fm) {
    const [, frontmatter, rest] = fm;
    body = rest;
    for (const line of frontmatter.split("\n")) {
      const m = line.match(/^([a-z_]+):\s*(.*)$/i);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^"(.*)"$/, "$1");
      if (key === "title") title = val;
      else if (key === "zoom_account") zoomAccount = val || null;
      // Date lives in recording_start (Zoom API) OR meeting_date (Gmail summary).
      else if ((key === "recording_start" || key === "meeting_date") && !dateStr) dateStr = val;
    }
  }

  const date = dateStr ? new Date(dateStr) : null;
  return {
    title,
    zoomAccount,
    date: date && !isNaN(date.getTime()) ? date : null,
    body: body.trim(),
  };
}

/** Whether a parsed meeting is in scope for extraction. */
export function shouldProcess(meta: { zoomAccount: string | null; title: string }): boolean {
  if (!meta.zoomAccount || !ALLOWED_ACCOUNTS.has(meta.zoomAccount)) return false;
  if (EXCLUDED_TITLE_PATTERNS.some((re) => re.test(meta.title))) return false;
  return true;
}

const EXTRACTION_SYSTEM = [
  "You extract concrete, assignable action items from a virtual-assistant team's meeting transcript.",
  "Return ONLY a JSON array (no prose, no markdown fence). Each element:",
  '{ "title": string (imperative, <=80 chars), "description"?: string (1-2 sentences of context),',
  '  "suggestedAssignee"?: string (a person\'s name explicitly tasked in the transcript),',
  '  "suggestedDueDate"?: string (YYYY-MM-DD, only if a clear deadline was stated),',
  '  "clientContext"?: string (client/org the item is about, if clear) }',
  "Rules: only real follow-ups, deliverables, or commitments — not routine chatter.",
  "Ground every item in something actually said. If there are no clear action items, return [].",
  "Never invent assignees, dates, or clients. Omit a field rather than guessing.",
].join("\n");

/** Build the chat messages for the extraction call. `maxBodyChars` trims long transcripts. */
export function buildExtractionMessages(
  meta: MeetingMeta,
  maxBodyChars = 24000,
): { role: "system" | "user"; content: string }[] {
  const header = [
    `MEETING: ${meta.title || "(untitled)"}`,
    meta.date ? `DATE: ${meta.date.toISOString().slice(0, 10)}` : "",
    meta.zoomAccount ? `ACCOUNT: ${meta.zoomAccount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const body =
    meta.body.length > maxBodyChars ? meta.body.slice(0, maxBodyChars) + "\n…[truncated]" : meta.body;
  return [
    { role: "system", content: EXTRACTION_SYSTEM },
    { role: "user", content: `${header}\n\nTRANSCRIPT:\n${body}` },
  ];
}

/**
 * Parse + validate the model output. Returns:
 *  - ProposedItem[]  for a valid array (possibly empty)
 *  - null            for unparseable output (caller skips file → retried)
 */
export function parseExtractedItems(text: string): ProposedItem[] | null {
  if (typeof text !== "string") return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const items: ProposedItem[] = [];
  for (const el of raw) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const title = str(o.title);
    if (!title) continue;
    const dueRaw = str(o.suggestedDueDate);
    const due = dueRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : undefined;
    items.push({
      title: title.slice(0, 200),
      description: str(o.description),
      suggestedAssignee: str(o.suggestedAssignee),
      suggestedDueDate: due,
      clientContext: str(o.clientContext),
    });
  }
  return items;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/meeting-extract.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meetings/extract.ts tests/meeting-extract.test.ts
git commit -m "feat(meeting-actions): pure transcript-extraction lib + tests"
```

---

## Task 3: Pure confirm/skip service helpers

**Files:**
- Create: `src/lib/services/meeting-actions.ts`
- Test: `tests/meeting-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/meeting-actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { allItemsResolved, matchAssignee } from "../src/lib/services/meeting-actions";

test("allItemsResolved: false when any item still PENDING", () => {
  assert.equal(allItemsResolved([{ status: "CONFIRMED" }, { status: "PENDING" }]), false);
});

test("allItemsResolved: true when all CONFIRMED/SKIPPED", () => {
  assert.equal(allItemsResolved([{ status: "CONFIRMED" }, { status: "SKIPPED" }]), true);
});

test("allItemsResolved: false for an empty list (nothing to resolve)", () => {
  assert.equal(allItemsResolved([]), false);
});

test("matchAssignee: exact + partial name match (case-insensitive)", () => {
  const users = [
    { id: "u1", name: "Aira Mangila" },
    { id: "u2", name: "Kanna Saito" },
  ];
  assert.equal(matchAssignee("Aira", users), "u1");
  assert.equal(matchAssignee("kanna saito", users), "u2");
  assert.equal(matchAssignee("Aira Mangila", users), "u1");
});

test("matchAssignee: no match → null", () => {
  assert.equal(matchAssignee("Zawadi", [{ id: "u1", name: "Aira" }]), null);
  assert.equal(matchAssignee("", [{ id: "u1", name: "Aira" }]), null);
  assert.equal(matchAssignee(null, [{ id: "u1", name: "Aira" }]), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/meeting-actions.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/services/meeting-actions'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/services/meeting-actions.ts`:

```ts
// Pure helpers for the Meeting Actions confirm/skip flow — unit-testable.

export type ItemStatus = "PENDING" | "CONFIRMED" | "SKIPPED";

/** A MeetingAction is resolved once it has items and none is still PENDING. */
export function allItemsResolved(items: { status: ItemStatus }[]): boolean {
  return items.length > 0 && items.every((i) => i.status !== "PENDING");
}

/**
 * Best-effort match of a transcript-suggested assignee name to a known user id.
 * Case-insensitive; matches when either name contains the other (handles
 * "Aira" ↔ "Aira Mangila"). Returns the first match or null.
 */
export function matchAssignee(
  suggested: string | null | undefined,
  users: { id: string; name: string | null }[],
): string | null {
  const s = (suggested ?? "").trim().toLowerCase();
  if (!s) return null;
  for (const u of users) {
    const n = (u.name ?? "").trim().toLowerCase();
    if (!n) continue;
    if (n === s || n.includes(s) || s.includes(n)) return u.id;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/meeting-actions.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/meeting-actions.ts tests/meeting-actions.test.ts
git commit -m "feat(meeting-actions): pure resolve/assignee-match helpers + tests"
```

---

## Task 4: The transcript-to-tasks worker

**Files:**
- Create: `worker/transcript-to-tasks.ts`
- Modify: `package.json` (add `worker:transcript` script)

- [ ] **Step 1: Add the npm script**

In `package.json`, add after the `"worker:recordings"` line (line 25):

```json
    "worker:recordings": "tsx worker/recordings-process.ts",
    "worker:transcript": "tsx worker/transcript-to-tasks.ts"
```

(Add a comma after the `worker:recordings` line; `worker:transcript` is the last script.)

- [ ] **Step 2: Write the worker**

Create `worker/transcript-to-tasks.ts`:

```ts
/**
 * transcript-to-tasks — read harvested Zoom transcripts, extract proposed action
 * items via OpenRouter, and queue them as MeetingAction rows for a team lead to
 * confirm in the console. Idempotent: MeetingAction.meetingFile is the cursor —
 * any Meetings/*.md not yet in the table is unprocessed. Runs on a systemd timer
 * (va-management-transcript.timer) at :15 past the hour, after the harvester.
 *
 * Strong-fit LLM task (local-AI-gateway routing guide): single doc in, strict
 * JSON out. Cross-cutting logic (frontmatter parse, account filter, JSON
 * validation) lives in src/lib/meetings/extract.ts (pure, unit-tested).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { openrouterChat } from "@/lib/matrix/openrouter";
import {
  parseMeetingFile,
  shouldProcess,
  buildExtractionMessages,
  parseExtractedItems,
  type ProposedItem,
} from "@/lib/meetings/extract";

const MEETINGS_DIR = process.env.MEETINGS_DIR || "/app/SecondBrain/Meetings";
const MODEL = process.env.OPENROUTER_TRANSCRIPT_MODEL || "google/gemini-2.5-flash-lite";
const BATCH = Number(process.env.TRANSCRIPT_BATCH || "8");

async function main() {
  const run = await db.syncRun.create({ data: { worker: "transcript-to-tasks", status: "FAILED" } });
  let processed = 0;
  let withItems = 0;
  let skippedScope = 0;
  let parseFailed = 0;

  try {
    if (!env.OPENROUTER_API_KEY?.trim()) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), firstErrorLine: "OpenRouter key absent — skipped", detailsJson: { skipped: true } },
      });
      console.log("transcript-to-tasks: skipped (no OpenRouter key)");
      return;
    }

    let files: string[];
    try {
      files = (await readdir(MEETINGS_DIR)).filter((f) => f.endsWith(".md") && f !== "meetings_index.md");
    } catch (err) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), firstErrorLine: `Meetings dir unavailable: ${String(err).split("\n")[0]}`, detailsJson: { skipped: true } },
      });
      console.log(`transcript-to-tasks: skipped (Meetings dir not found at ${MEETINGS_DIR})`);
      return;
    }

    // Idempotency: which of these absolute paths are already recorded?
    const fullPaths = files.map((f) => path.join(MEETINGS_DIR, f));
    const existing = await db.meetingAction.findMany({
      where: { meetingFile: { in: fullPaths } },
      select: { meetingFile: true },
    });
    const seen = new Set(existing.map((e) => e.meetingFile));

    for (const file of files) {
      if (processed >= BATCH) break;
      const fullPath = path.join(MEETINGS_DIR, file);
      if (seen.has(fullPath)) continue;

      const md = await readFile(fullPath, "utf8").catch(() => null);
      if (md === null) { parseFailed++; continue; }

      const meta = parseMeetingFile(md);
      if (!shouldProcess(meta)) { skippedScope++; continue; }

      // ONE LLM call per meeting (strong-fit: single doc → strict JSON).
      let items: ProposedItem[] | null;
      try {
        const res = await openrouterChat({
          messages: buildExtractionMessages(meta),
          temperature: 0.2,
          max_tokens: 1500,
          model: MODEL,
        });
        items = parseExtractedItems(res.choices?.[0]?.message?.content ?? "");
      } catch (err) {
        console.warn(`  ${file}: LLM call failed — ${String(err).split("\n")[0]}`);
        parseFailed++;
        continue; // no row written → retried next run
      }

      if (items === null) {
        console.warn(`  ${file}: unparseable LLM output — skipped, will retry`);
        parseFailed++;
        continue; // no row written → retried next run
      }

      // Valid (possibly empty) → write the cursor row so it's never reprocessed.
      await db.meetingAction.create({
        data: {
          meetingFile: fullPath,
          meetingTitle: meta.title || file.replace(/\.md$/, ""),
          meetingDate: meta.date,
          zoomAccount: meta.zoomAccount,
          status: items.length === 0 ? "RESOLVED" : "PENDING",
          items: {
            create: items.map((it) => ({
              title: it.title,
              description: it.description ?? null,
              suggestedAssignee: it.suggestedAssignee ?? null,
              suggestedDueDate: it.suggestedDueDate ? new Date(it.suggestedDueDate) : null,
              clientContext: it.clientContext ?? null,
            })),
          },
        },
      });
      processed++;
      if (items.length > 0) withItems++;
      console.log(`  ${file}: ${items.length} item(s)`);
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        detailsJson: { processed, withItems, skippedScope, parseFailed, model: MODEL },
      },
    });
    console.log(
      `transcript-to-tasks: processed ${processed} (with items ${withItems}); ${skippedScope} out-of-scope; ${parseFailed} parse/LLM failures (retry next run)`,
    );
  } catch (err) {
    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] },
    });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`transcript-to-tasks failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Smoke-run the worker locally against a temp dir (no DB writes expected to fail)**

This dry exercise proves the worker boots, reads a dir, and the no-key/empty-dir guards work. With no `OPENROUTER_API_KEY` set locally it should log the skip and exit 0:

Run:
```bash
MEETINGS_DIR=/tmp/none OPENROUTER_API_KEY= npm run worker:transcript
```
Expected: prints `transcript-to-tasks: skipped (no OpenRouter key)` and exits 0. (If your local `.env` has an OpenRouter key, it instead prints `skipped (Meetings dir not found at /tmp/none)` — also exit 0. Either guard firing is success.)

- [ ] **Step 5: Commit**

```bash
git add worker/transcript-to-tasks.ts package.json
git commit -m "feat(meeting-actions): transcript-to-tasks worker"
```

---

## Task 5: systemd units

**Files:**
- Create: `deploy/systemd/va-management-transcript.service`
- Create: `deploy/systemd/va-management-transcript.timer`

- [ ] **Step 1: Create the service unit**

Create `deploy/systemd/va-management-transcript.service`:

```ini
[Unit]
Description=PWA VA Management transcript-to-tasks worker (Zoom transcripts -> proposed tasks)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=oneshot
WorkingDirectory=/app/SecondBrain/va-management-console/current
EnvironmentFile=/app/SecondBrain/va-management-console/shared/.env.production
# Shared OpenRouter key. Optional (-): the worker no-ops if absent, so the unit
# still runs cleanly. Provides OPENROUTER_API_KEY + OPENROUTER_BASE_URL.
EnvironmentFile=-/etc/secondbrain/openrouter.env
ExecStart=/app/SecondBrain/va-management-console/current/node_modules/.bin/tsx worker/transcript-to-tasks.ts
User=root
```

- [ ] **Step 2: Create the timer unit**

Create `deploy/systemd/va-management-transcript.timer`:

```ini
[Unit]
Description=Run the transcript-to-tasks worker hourly (15 min after the harvester at :00)

[Timer]
OnCalendar=*-*-* *:15:00
Persistent=true
Unit=va-management-transcript.service

[Install]
WantedBy=timers.target
```

- [ ] **Step 3: Commit**

```bash
git add deploy/systemd/va-management-transcript.service deploy/systemd/va-management-transcript.timer
git commit -m "feat(meeting-actions): systemd service + hourly timer"
```

(Installation on the VPS happens in Task 9.)

---

## Task 6: Confirm/skip server actions

**Files:**
- Create: `src/lib/actions/meeting-actions.ts`

- [ ] **Step 1: Implement the actions**

Create `src/lib/actions/meeting-actions.ts`:

```ts
import { db } from "@/lib/db";
import { createTask } from "@/lib/actions/tasks";
import { allItemsResolved } from "@/lib/services/meeting-actions";
import type { CurrentUser } from "@/lib/auth/access";

/** Flip a MeetingAction to RESOLVED once all its items are confirmed/skipped. */
async function maybeResolveAction(meetingActionId: string): Promise<void> {
  const items = await db.meetingActionItem.findMany({
    where: { meetingActionId },
    select: { status: true },
  });
  if (allItemsResolved(items)) {
    await db.meetingAction.update({ where: { id: meetingActionId }, data: { status: "RESOLVED" } });
  }
}

/** Confirm one item → create a real Task via createTask, then mark CONFIRMED. */
export async function confirmMeetingActionItem(
  user: CurrentUser,
  input: { itemId: string; assigneeId: string; dueDate?: string },
) {
  const item = await db.meetingActionItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error("Meeting action item not found");
  if (item.status !== "PENDING") throw new Error("Item already resolved");

  // createTask enforces delegation authority, sends the assignment email, and
  // writes ActivityLog + a notification — identical to a manually created task.
  const task = await createTask(user.id, user.role, {
    title: item.title,
    instructions: item.description ?? undefined,
    assignedToId: input.assigneeId,
    dueDate: input.dueDate,
    client: item.clientContext ?? undefined,
  });

  await db.meetingActionItem.update({
    where: { id: item.id },
    data: { status: "CONFIRMED", taskId: task.id, resolvedBy: user.email, resolvedAt: new Date() },
  });
  await maybeResolveAction(item.meetingActionId);
  return { taskId: task.id };
}

/** Skip one item, or all still-pending items on a meeting. */
export async function skipMeetingActionItems(
  user: CurrentUser,
  input: { meetingActionId: string; itemId?: string; all?: boolean },
) {
  if (!input.all && !input.itemId) throw new Error("itemId or all required");
  const where = input.all
    ? { meetingActionId: input.meetingActionId, status: "PENDING" as const }
    : { id: input.itemId, meetingActionId: input.meetingActionId, status: "PENDING" as const };

  await db.meetingActionItem.updateMany({
    where,
    data: { status: "SKIPPED", resolvedBy: user.email, resolvedAt: new Date() },
  });
  await maybeResolveAction(input.meetingActionId);
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/meeting-actions.ts
git commit -m "feat(meeting-actions): confirm/skip server actions"
```

---

## Task 7: Role predicate + API routes

**Files:**
- Modify: `src/lib/auth/roles.ts` (add `canReviewMeetingActions`)
- Create: `src/app/api/meeting-actions/[id]/confirm/route.ts`
- Create: `src/app/api/meeting-actions/[id]/skip/route.ts`

- [ ] **Step 1: Add the role predicate**

In `src/lib/auth/roles.ts`, add after `canManageTasks` (around line 60):

```ts
/** Roles allowed to review the Meeting Actions queue (Zoom transcript → tasks). */
export function canReviewMeetingActions(role: Role): boolean {
  return role === "HR_MANAGER" || role === "TEAM_LEAD" || role === "SENIOR_VA";
}
```

- [ ] **Step 2: Create the confirm route**

Create `src/app/api/meeting-actions/[id]/confirm/route.ts`:

```ts
import { getCurrentUser } from "@/lib/auth/access";
import { canReviewMeetingActions } from "@/lib/auth/roles";
import { runWithActor } from "@/lib/request-context";
import { confirmMeetingActionItem } from "@/lib/actions/meeting-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user.isAdmin && !canReviewMeetingActions(user.role)) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }
  await params; // [id] = meetingActionId; the item carries its own parent link

  let body: { itemId?: string; assigneeId?: string; dueDate?: string };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.itemId || !body.assigneeId) {
    return Response.json({ ok: false, error: "itemId and assigneeId required" }, { status: 400 });
  }

  try {
    const result = await runWithActor(user.email, () =>
      confirmMeetingActionItem(user, { itemId: body.itemId!, assigneeId: body.assigneeId!, dueDate: body.dueDate }),
    );
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
```

- [ ] **Step 3: Create the skip route**

Create `src/app/api/meeting-actions/[id]/skip/route.ts`:

```ts
import { getCurrentUser } from "@/lib/auth/access";
import { canReviewMeetingActions } from "@/lib/auth/roles";
import { runWithActor } from "@/lib/request-context";
import { skipMeetingActionItems } from "@/lib/actions/meeting-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user.isAdmin && !canReviewMeetingActions(user.role)) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }
  const { id } = await params;

  let body: { itemId?: string; all?: boolean };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await runWithActor(user.email, () =>
      skipMeetingActionItems(user, { meetingActionId: id, itemId: body.itemId, all: body.all }),
    );
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/roles.ts src/app/api/meeting-actions
git commit -m "feat(meeting-actions): role predicate + confirm/skip API routes"
```

---

## Task 8: UI — page, client component, and nav

**Files:**
- Create: `src/app/(app)/meeting-actions/page.tsx`
- Create: `src/components/MeetingActionsClient.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create the page (server component)**

Create `src/app/(app)/meeting-actions/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canReviewMeetingActions } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { matchAssignee } from "@/lib/services/meeting-actions";
import { MeetingActionsClient, type MeetingCard } from "@/components/MeetingActionsClient";

export const dynamic = "force-dynamic";

export default async function MeetingActionsPage() {
  const user = await getCurrentUser();
  if (!user.isAdmin && !canReviewMeetingActions(user.role)) redirect("/");

  // Pending meetings (at least one pending item), newest first.
  const meetings = await db.meetingAction.findMany({
    where: { status: "PENDING", items: { some: { status: "PENDING" } } },
    orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }],
    include: {
      items: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          suggestedAssignee: true,
          suggestedDueDate: true,
          clientContext: true,
        },
      },
    },
  });

  // Assignable users for the dropdowns (active VAs + delegators).
  const assignees = await db.user.findMany({
    where: { active: true, role: { in: ["VA", "SENIOR_VA", "TEAM_LEAD", "HR_MANAGER", "PEOPLE_OPS"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const nameList = assignees.map((a) => ({ id: a.id, name: a.name }));

  const cards: MeetingCard[] = meetings.map((m) => ({
    id: m.id,
    title: m.meetingTitle,
    date: m.meetingDate ? m.meetingDate.toISOString() : null,
    zoomAccount: m.zoomAccount,
    items: m.items.map((it) => ({
      id: it.id,
      title: it.title,
      description: it.description,
      clientContext: it.clientContext,
      suggestedAssignee: it.suggestedAssignee,
      suggestedDueDate: it.suggestedDueDate ? it.suggestedDueDate.toISOString().slice(0, 10) : null,
      matchedAssigneeId: matchAssignee(it.suggestedAssignee, nameList),
    })),
  }));

  return <MeetingActionsClient cards={cards} assignees={assignees} />;
}
```

- [ ] **Step 2: Create the client component**

Create `src/components/MeetingActionsClient.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type Assignee = { id: string; name: string | null; email: string };
export type MeetingItem = {
  id: string;
  title: string;
  description: string | null;
  clientContext: string | null;
  suggestedAssignee: string | null;
  suggestedDueDate: string | null; // YYYY-MM-DD
  matchedAssigneeId: string | null;
};
export type MeetingCard = {
  id: string;
  title: string;
  date: string | null; // ISO
  zoomAccount: string | null;
  items: MeetingItem[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function MeetingActionsClient({ cards, assignees }: { cards: MeetingCard[]; assignees: Assignee[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-item editable assignee + due date, seeded from the AI suggestion.
  const [edits, setEdits] = useState<Record<string, { assigneeId: string; dueDate: string }>>(() => {
    const init: Record<string, { assigneeId: string; dueDate: string }> = {};
    for (const c of cards) for (const it of c.items) init[it.id] = { assigneeId: it.matchedAssigneeId ?? "", dueDate: it.suggestedDueDate ?? "" };
    return init;
  });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    // First card expanded, rest collapsed (matches the mockup).
    const init: Record<string, boolean> = {};
    cards.forEach((c, i) => (init[c.id] = i !== 0));
    return init;
  });

  const totalItems = cards.reduce((n, c) => n + c.items.length, 0);

  async function post(url: string, body: unknown) {
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
    if (!data.ok) throw new Error(data.error || "Request failed");
  }

  async function confirmItem(meetingId: string, it: MeetingItem) {
    const edit = edits[it.id];
    if (!edit?.assigneeId) { setError(`Pick an assignee for "${it.title}" first.`); return; }
    setBusy(it.id);
    try {
      await post(`/api/meeting-actions/${meetingId}/confirm`, { itemId: it.id, assigneeId: edit.assigneeId, dueDate: edit.dueDate || undefined });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setBusy(null);
    }
  }

  async function skipItem(meetingId: string, itemId: string) {
    setBusy(itemId);
    try {
      await post(`/api/meeting-actions/${meetingId}/skip`, { itemId });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to skip");
    } finally {
      setBusy(null);
    }
  }

  async function confirmAll(card: MeetingCard) {
    const missing = card.items.find((it) => !edits[it.id]?.assigneeId);
    if (missing) { setError(`Pick an assignee for "${missing.title}" before confirming all.`); return; }
    setBusy(card.id);
    try {
      for (const it of card.items) {
        const edit = edits[it.id];
        await post(`/api/meeting-actions/${card.id}/confirm`, { itemId: it.id, assigneeId: edit.assigneeId, dueDate: edit.dueDate || undefined });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm all");
    } finally {
      setBusy(null);
    }
  }

  async function skipAll(card: MeetingCard) {
    setBusy(card.id);
    try {
      await post(`/api/meeting-actions/${card.id}/skip`, { all: true });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to skip all");
    } finally {
      setBusy(null);
    }
  }

  if (cards.length === 0) {
    return (
      <div>
        <h1 style={{ marginBottom: 4 }}>Meeting Actions</h1>
        <p style={{ color: "var(--color-slate-400, #64748b)" }}>
          No pending meeting actions — check back after the next transcript is processed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Meeting Actions</h1>
          <p style={{ color: "var(--color-slate-400, #64748b)", fontSize: 13 }}>
            AI-extracted tasks from recent meeting transcripts — review and confirm.
          </p>
        </div>
        <span style={{ color: "var(--color-slate-400, #94a3b8)", fontSize: 13 }}>
          {cards.length} meeting{cards.length === 1 ? "" : "s"} pending · {totalItems} item{totalItems === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div style={{ background: "#7f1d1d", color: "#fee2e2", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {cards.map((card) => {
        const isCollapsed = collapsed[card.id];
        const lead =
          card.items.map((i) => i.suggestedAssignee).filter(Boolean).sort((a, b) =>
            card.items.filter((x) => x.suggestedAssignee === b).length - card.items.filter((x) => x.suggestedAssignee === a).length,
          )[0] || null;
        return (
          <div key={card.id} style={{ border: "1px solid var(--color-slate-700, #334155)", borderRadius: 8, marginBottom: 12, background: "var(--color-slate-800, #1e293b)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: isCollapsed ? "none" : "1px solid var(--color-slate-700, #334155)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{card.title}</div>
                <div style={{ fontSize: 12, color: "var(--color-slate-400, #64748b)", marginTop: 2 }}>
                  {[fmtDate(card.date), card.zoomAccount, lead ? `${lead} (lead)` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={() => confirmAll(card)} disabled={busy !== null} style={{ background: "#22c55e", color: "#000", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 5, border: "none", cursor: "pointer" }}>
                  Confirm all ({card.items.length})
                </button>
                <button onClick={() => skipAll(card)} disabled={busy !== null} style={{ background: "none", border: "none", color: "var(--color-slate-400, #64748b)", fontSize: 12, cursor: "pointer" }}>
                  Skip all
                </button>
                <button onClick={() => setCollapsed((c) => ({ ...c, [card.id]: !c[card.id] }))} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, cursor: "pointer" }}>
                  {isCollapsed ? "Expand ▾" : "Collapse ▴"}
                </button>
              </div>
            </div>

            {!isCollapsed &&
              card.items.map((it) => (
                <div key={it.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 16px", borderBottom: "1px solid var(--color-slate-900, #0f172a)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</div>
                    {(it.description || it.clientContext) && (
                      <div style={{ fontSize: 12, color: "var(--color-slate-400, #64748b)", marginTop: 2 }}>
                        {[it.description, it.clientContext].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <select
                      value={edits[it.id]?.assigneeId ?? ""}
                      onChange={(e) => setEdits((s) => ({ ...s, [it.id]: { ...s[it.id], assigneeId: e.target.value } }))}
                      style={{ background: "var(--color-slate-900, #0f172a)", border: "1px solid var(--color-slate-700, #334155)", borderRadius: 4, color: "inherit", fontSize: 12, padding: "3px 6px" }}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={edits[it.id]?.dueDate ?? ""}
                      onChange={(e) => setEdits((s) => ({ ...s, [it.id]: { ...s[it.id], dueDate: e.target.value } }))}
                      style={{ background: "var(--color-slate-900, #0f172a)", border: "1px solid var(--color-slate-700, #334155)", borderRadius: 4, color: "inherit", fontSize: 12, padding: "3px 6px" }}
                    />
                    <button onClick={() => confirmItem(card.id, it)} disabled={busy !== null} style={{ color: "#22c55e", background: "none", fontSize: 12, cursor: "pointer", padding: "3px 8px", border: "1px solid #22c55e", borderRadius: 4 }}>
                      ✓ Add
                    </button>
                    <button onClick={() => skipItem(card.id, it.id)} disabled={busy !== null} style={{ color: "#ef4444", background: "none", border: "none", fontSize: 12, cursor: "pointer" }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Add the gated nav block to the Sidebar**

In `src/components/Sidebar.tsx`, extend the props (the `export function Sidebar({...})` destructure + its type) to add:

```tsx
  showMeetingActions = false,
  meetingActionsCount = 0,
```

and in the type literal:

```tsx
  showMeetingActions?: boolean;
  meetingActionsCount?: number;
```

Then add this block immediately **before** the `{isAdmin && (` Admin block (around line 131):

```tsx
      {/* Meeting Actions — Zoom transcript → tasks queue. Shown to task
          reviewers (HR Manager / Team Lead / Senior VA) across either view. */}
      {showMeetingActions && (
        <div>
          <div className="nav-label">Meetings</div>
          <a href="/meeting-actions" className="nav-item" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Meeting Actions</span>
            {meetingActionsCount > 0 && (
              <span style={{ background: "#f59e0b", color: "#000", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>
                {meetingActionsCount}
              </span>
            )}
          </a>
        </div>
      )}
```

- [ ] **Step 4: Wire the layout to compute the flag + count**

In `src/app/(app)/layout.tsx`:

Add to the imports from `@/lib/auth/roles` — there is no existing import line for roles, so add one near the top with the other `@/lib/auth` imports (after line 4):

```tsx
import { canReviewMeetingActions } from "@/lib/auth/roles";
```

Add the computation after `const unread = ...` (line 60):

```tsx
  const showMeetingActions = user.isAdmin || canReviewMeetingActions(user.role);
  const meetingActionsCount = showMeetingActions
    ? await db.meetingAction.count({ where: { status: "PENDING", items: { some: { status: "PENDING" } } } })
    : 0;
```

Update the `<Sidebar ... />` props (line 69) to pass them:

```tsx
        <Sidebar view={view} role={user.role} name={user.name ?? user.email} isAdmin={user.isAdmin} showBeta={betaVisible} canDelegate={canDelegate} showMeetingActions={showMeetingActions} meetingActionsCount={meetingActionsCount} />
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: typecheck exits 0; `next build` completes with `/meeting-actions` listed among the routes and no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/meeting-actions src/components/MeetingActionsClient.tsx src/components/Sidebar.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(meeting-actions): review tab, client UI, and gated sidebar nav"
```

---

## Task 9: Deploy

**Files:**
- No code changes — uses `deploy.sh` (which runs `prisma migrate deploy` + build + restart) plus a one-time systemd install on the VPS.

- [ ] **Step 1: Run the full test suite + build one more time**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass — the existing suite plus 17 new (12 in `meeting-extract.test.ts`, 5 in `meeting-actions.test.ts`); typecheck exits 0; build clean.

- [ ] **Step 2: Deploy app + migration to the VPS**

Run: `./deploy.sh`
Expected: rsync → `npm ci` → `prisma generate` → `prisma migrate deploy` (applies `meeting_actions`) → `npm run build` → `systemctl restart va-management-web` → prints `active=active` and a health JSON. The new worker file ships in the same rsync.

- [ ] **Step 3: Install + enable the systemd timer on the VPS (one-time)**

Run:
```bash
ssh root@74.208.40.108 '
  cp /app/SecondBrain/va-management-console/current/deploy/systemd/va-management-transcript.service /etc/systemd/system/ &&
  cp /app/SecondBrain/va-management-console/current/deploy/systemd/va-management-transcript.timer /etc/systemd/system/ &&
  systemctl daemon-reload &&
  systemctl enable --now va-management-transcript.timer &&
  systemctl list-timers va-management-transcript.timer --no-pager
'
```
Expected: the timer is listed with a `NEXT` firing time at the next `:15`.

- [ ] **Step 4: Trigger one run now and verify it processed transcripts**

Run:
```bash
ssh root@74.208.40.108 'systemctl start va-management-transcript.service && journalctl -u va-management-transcript.service -n 30 --no-pager'
```
Expected: log shows `transcript-to-tasks: processed N (with items M); K out-of-scope; ...` (first run will process up to `BATCH=8` of the in-scope backlog; subsequent runs continue since each is a fresh cursor check).

- [ ] **Step 5: Verify rows landed in Postgres**

Run:
```bash
ssh root@74.208.40.108 "su - postgres -c \"psql va_console -c 'SELECT status, count(*) FROM \\\"MeetingAction\\\" GROUP BY status;'\""
```
Expected: a `PENDING` and/or `RESOLVED` count > 0. (Exact psql invocation may differ; the goal is to confirm `MeetingAction` rows exist.)

- [ ] **Step 6: Verify the tab in the browser**

Open https://team.pwasecondbrain.uk/meeting-actions while signed in as an HR Manager / Team Lead / Senior VA (or admin). Expected: the sidebar shows "Meeting Actions" (with a badge if items are pending); the page lists meeting cards; clicking **✓ Add** on an item creates a Task (check `/hr/tasks`) and the item disappears after refresh; **Skip** removes an item; when a meeting's last item is resolved the card disappears.

- [ ] **Step 7: Final commit (if the run surfaced any tweak)**

```bash
git add -A
git commit -m "chore(meeting-actions): deploy + enable transcript timer" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Idempotency is the cursor.** Never add a separate state file. A `Meetings/*.md` path absent from `MeetingAction.meetingFile` is unprocessed; an empty-result meeting still gets a `RESOLVED` row so it isn't re-queried.
- **`parseExtractedItems` returns `null` vs `[]` deliberately.** `null` = unparseable → the worker writes **no** row → retried next run. `[]` = valid-but-nothing → write a `RESOLVED` row → never retried. Don't collapse these.
- **Confirm reuses `createTask`** so emails / `ActivityLog` / notifications fire exactly as for manual tasks — do not duplicate that logic.
- **Out-of-scope accounts (`PWA`, `PWA OS`) are skipped and counted** (`skippedScope` in the `SyncRun` details + the log line). To include them later, add them to `ALLOWED_ACCOUNTS` in `src/lib/meetings/extract.ts` — one line, with a test update.
- **The badge/pill uses an inline `#f59e0b`** because there's no `--color-amber` token or `.badge` class in `globals.css`. If one is added later, switch to it.
