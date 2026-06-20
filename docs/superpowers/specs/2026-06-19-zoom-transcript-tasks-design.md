# Zoom Transcript → Tasks: Design Spec

**Date:** 2026-06-19  
**Status:** Approved  
**Scope:** Phase 1 — Automatic extraction of action items from Zoom meeting transcripts into a confirmation queue in the VA Management Console

---

## Overview

The Zoom Transcript Harvester already polls Zoom cloud recordings every 30 minutes and writes structured Markdown files to `SecondBrain/Meetings/` on the VPS. This feature adds an AI-powered worker that reads those transcripts, extracts proposed tasks, and surfaces them in a new "Meeting Actions" tab in the VA Management Console. Team leads and senior VAs review the proposed items and confirm or skip them — confirmed items become real tasks using the existing `createTask` flow.

---

## 1. Architecture

```
SecondBrain/Meetings/*.md
  (harvested every 30 min on VPS via zoom-transcript-harvester)
           ↓
worker/transcript-to-tasks.ts           ← new
  - systemd timer (every 2 hours, at :15 past the hour)
  - reads all .md files not yet in MeetingAction table
  - filters to Northeast / Business (BFC) accounts only
  - sends transcript to LLM (OpenRouter)
  - parses JSON array of proposed items
  - saves MeetingAction + MeetingActionItem rows
           ↓
PostgreSQL va_console DB
  new models: MeetingAction + MeetingActionItem
           ↓
VA Console — new "Meeting Actions" tab
  visible to: HR_MANAGER, TEAM_LEAD, SENIOR_VA
  shows: pending items grouped by meeting
  actions: edit assignee/due date → "Add as Task" or "Skip"
  "Confirm all" creates all pending items at once
```

---

## 2. Data Model

Add to `prisma/schema.prisma`:

```prisma
model MeetingAction {
  id           String              @id @default(cuid())
  meetingFile  String              @unique  // path used as cursor; prevents double-processing
  meetingTitle String
  meetingDate  DateTime?
  zoomAccount  String?             // "Northeast" or "Business (BFC)"
  items        MeetingActionItem[]
  status       MeetingActionStatus @default(PENDING)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
}

model MeetingActionItem {
  id              String                  @id @default(cuid())
  meetingAction   MeetingAction           @relation(fields: [meetingActionId], references: [id])
  meetingActionId String
  title           String
  description     String?
  suggestedAssignee  String?              // VA name/email extracted from transcript
  suggestedDueDate   DateTime?
  clientContext   String?                 // client name mentioned in transcript
  status          MeetingActionItemStatus @default(PENDING)
  taskId          String?                 // set when confirmed; references Task.id
  resolvedBy      String?                 // email of who acted on it
  resolvedAt      DateTime?
  createdAt       DateTime                @default(now())
}

enum MeetingActionStatus     { PENDING RESOLVED }
enum MeetingActionItemStatus { PENDING CONFIRMED SKIPPED }
```

The existing `Task` model is unchanged. No back-reference from `Task` to `MeetingActionItem` is needed for MVP.

---

## 3. Worker + LLM Extraction

**File:** `worker/transcript-to-tasks.ts`

### Finding new meetings

The worker reads all `.md` files in `/app/SecondBrain/Meetings/`. Any file whose path does not already have a `MeetingAction` row is unprocessed. The `@unique meetingFile` constraint serves as the cursor — no additional state table needed. Processing is naturally idempotent.

**Attribution filter:** Per the Zoom Transcript Harvester's attribution notes, only files where frontmatter `zoom_account` is `"Northeast"` or `"Business (BFC)"` are processed. Meetings named `FGS Video review` or `NE PWA Projects` are skipped (they belong to Zawadi/Aira, not Justin).

### LLM prompt

The worker sends the model:
- Meeting title + date (from frontmatter)
- Attendees list (from frontmatter, if present)
- Full transcript body, trimmed to ~6,000 tokens

Expected JSON response:
```json
[
  {
    "title": "Send updated proposal to Mark",
    "description": "Client asked for revised pricing by end of week",
    "suggestedAssignee": "Aira",
    "suggestedDueDate": "2026-06-27",
    "clientContext": "Mark / Oakwood Solutions"
  }
]
```

If no action items are found the model returns `[]`. A `MeetingAction` row is still created with no items and status `RESOLVED` so the file is never reprocessed.

### Model

**Primary:** `google/gemini-2.5-flash-lite` via OpenRouter (key at `/etc/secondbrain/openrouter.env`). Cost ~$0.0003/call. Chosen for grounding discipline — escalates cleanly when nothing is actionable rather than confabulating items.  
**Fallback:** `deepseek/deepseek-chat-v3.1` if flash-lite is unavailable.

### Error handling

| Condition | Behavior |
|---|---|
| Transcript file can't be parsed | Skip file (no `MeetingAction` row created), log warning — retried next run |
| LLM returns malformed JSON | Skip file, log warning — retried next run |
| LLM returns `[]` | Save `MeetingAction` with no items, status `RESOLVED` — not retried |
| DB write fails | Throw — timer will retry in 2 hours |

### systemd timer

```ini
# /etc/systemd/system/va-management-transcript.timer
[Unit]
Description=VA Management transcript-to-tasks worker

[Timer]
OnCalendar=*-*-* *:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/va-management-transcript.service
[Unit]
Description=VA Management transcript-to-tasks worker (one-shot)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/node /app/SecondBrain/va-management-console/current/dist/worker/transcript-to-tasks.js
EnvironmentFile=/app/SecondBrain/va-management-console/shared/.env.production
EnvironmentFile=/etc/secondbrain/openrouter.env
WorkingDirectory=/app/SecondBrain/va-management-console/current
```

The harvester runs at `:00`; the worker runs at `:15` — giving the harvester 15 minutes to write new files before the worker looks for them.

---

## 4. UI — Meeting Actions Tab

### Visibility

The tab is shown to users with roles: `HR_MANAGER`, `TEAM_LEAD`, `SENIOR_VA`.

### Tab location

New entry in the sidebar nav between "Projects" and "Payroll". Shows a badge with the count of pending meetings (meetings with at least one `PENDING` item).

### Layout

Meetings are listed newest-first, grouped as collapsible cards. Each card shows:
- Meeting title, date, zoom account, and the most common `suggestedAssignee` across the meeting's items displayed as "suggested lead VA" (computed at render time, not stored)
- "Confirm all (N)" button — creates all pending items as tasks in one click
- "Skip all" link — marks all items `SKIPPED` and collapses the card
- Per-item rows (when expanded):
  - Amber dot indicator (pending state)
  - Task title + description (AI-extracted)
  - Client context label (if present)
  - Assignee dropdown — pre-populated with the AI suggestion, editable
  - Due date picker — pre-populated with the AI suggestion, editable
  - "✓ Add" button — confirms single item
  - "✕" button — skips single item

### Confirmation flow

When an item is confirmed (single or via "Confirm all"):
1. Calls the existing `createTask` server action with the edited assignee + due date
2. Sets `MeetingActionItem.taskId` to the new task's ID
3. Sets `MeetingActionItem.status` to `CONFIRMED`, records `resolvedBy` + `resolvedAt`
4. Same assignment email and `ActivityLog` entry fire as for manually created tasks

When all items on a `MeetingAction` are either `CONFIRMED` or `SKIPPED`, the `MeetingAction.status` flips to `RESOLVED` and the card disappears from the tab.

### Empty state

When no meetings are pending: "No pending meeting actions — check back after the next transcript is processed."

---

## 5. Out of Scope (Phase 1)

- **Zoom Marketplace App** — Phase 1 uses the existing Zoom Transcript Harvester. A proper Zoom App that can join any user's Zoom account is a Phase 2 concern.
- **Meeting Coach / Sales Coach** — separate features, separate specs.
- **Auto-assignment** — the worker suggests an assignee from transcript context but never auto-creates tasks without human confirmation.
- **Per-VA notification** — no push notification when a meeting action appears; the tab badge is the signal.
- **Project association** — items are created as standalone tasks. Linking to a Project is left to the confirming user.

---

## 6. Deployment Checklist

1. Add `MeetingAction` + `MeetingActionItem` + enums to `prisma/schema.prisma`
2. Run `prisma migrate dev` locally, `prisma migrate deploy` on VPS
3. Write `worker/transcript-to-tasks.ts`
4. Add `va-management-transcript.service` + `va-management-transcript.timer` to `deploy/systemd/`
5. Install systemd units and enable timer on VPS
6. Add Meeting Actions API routes (`GET /api/meeting-actions`, `POST /api/meeting-actions/[id]/confirm`, `POST /api/meeting-actions/[id]/skip`)
7. Add `src/app/(app)/meeting-actions/page.tsx` and sidebar nav entry with badge
8. Update role guard to show tab for HR_MANAGER, TEAM_LEAD, SENIOR_VA
9. Deploy via `./deploy.sh`
