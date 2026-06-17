# Projects & Task Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build project + task delegation so Team Leads / Senior VAs can assign work to VAs inside the app, track status, and communicate via comments — replacing Aira's Google Sheet tracker.

**Architecture:** Prisma schema additions (5 enums + 4 models + 6 User back-relations) feed two role-gated console views: HR/TL/SENIOR_VA gets Projects + All Tasks management tabs at `/hr/projects` and `/hr/tasks`; VAs get a personal task queue at `/va/tasks`. Task assignment fires a best-effort Gmail API email. Three Notion-linked resource fields (`relatedSops`, `relatedTrainings`, `suggestedTools`) are cached JSON arrays populated from the local Notion mirror at create/edit time, with a static fallback for tools.

**Tech Stack:** Next.js 15 App Router · TypeScript · Prisma 6 ORM · PostgreSQL (`va_console`) · `node:test` + `node:assert/strict` · `@googleapis/gmail` + OAuth2 (existing sender) · `node:fs` for Notion mirror reads

---

## File Structure

| Status | File | Responsibility |
|---|---|---|
| Modify | `prisma/schema.prisma` | 5 enums + 4 models + 6 User back-relations |
| Modify | `src/lib/auth/roles.ts` | `canManageTasks`, `canManageProjects` helpers |
| **Create** | `src/lib/services/tasks.ts` | 4 pure domain helpers (no DB) |
| **Create** | `tests/tasks.test.ts` | 13 unit tests for service functions |
| **Create** | `src/lib/notion-picker.ts` | SOP / Training / Tools pickers from Notion mirror |
| **Create** | `src/lib/reads/projects.ts` | `getProjectsList`, `getProjectDetail`, `getActivityFeed` |
| **Create** | `src/lib/reads/tasks.ts` | `getMyTasks`, `getAllTasks`, `getTaskDetail` |
| **Create** | `src/lib/actions/projects.ts` | `createProject`, `updateProject` |
| **Create** | `src/lib/actions/tasks.ts` | `createTask` (email), `updateTaskStatus`, `updateTask` |
| **Create** | `src/lib/actions/comments.ts` | `addTaskComment`, `addProjectComment` |
| Modify | `src/components/Sidebar.tsx` | "Projects" group in HR NAV, "My Tasks" in VA |
| **Create** | `src/app/(app)/hr/projects/page.tsx` | Project list + stats |
| **Create** | `src/app/(app)/hr/projects/[id]/page.tsx` | Project detail + activity feed |
| **Create** | `src/app/(app)/hr/tasks/page.tsx` | All-tasks flat view with filters |
| **Create** | `src/app/(app)/hr/tasks/[id]/page.tsx` | Task detail + comments (manager view) |
| **Create** | `src/app/(app)/va/tasks/page.tsx` | VA's personal task queue |
| **Create** | `src/app/(app)/va/tasks/[id]/page.tsx` | Task detail + status dropdown + comments (VA view) |

---

## Task 1: Schema additions

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums after the existing `Role` enum in prisma/schema.prisma**

Find the existing `enum Role { ... }` block and add the following immediately after it:

```prisma
enum ProjectStatus {
  Planning
  Active
  Done
  Paused
}

enum ProjectType {
  Project
  Event
  Recurring
  Report
}

enum Priority {
  Low
  Medium
  High
}

enum TaskStatus {
  NotStarted
  InProgress
  Done
  Blocked
}

enum TaskStrategy {
  Create
  Research
  Automate
  Communicate
  Plan
  Delegate
  Fix
  TechSupport
  Simplify
  Recurring
}
```

- [ ] **Step 2: Add Project, Task, TaskComment, ProjectComment models at the end of schema.prisma**

Append before the final closing brace (or at the end of the file):

```prisma
model Project {
  id          String        @id @default(cuid())
  name        String
  description String?
  status      ProjectStatus @default(Planning)
  type        ProjectType   @default(Project)
  priority    Priority      @default(Medium)
  client      String?
  ownerId     String
  createdById String
  dueDate     DateTime?
  links       String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  owner    User             @relation("ProjectOwner", fields: [ownerId], references: [id])
  createdBy User            @relation("ProjectCreator", fields: [createdById], references: [id])
  tasks    Task[]
  comments ProjectComment[]

  @@index([ownerId])
  @@index([status])
  @@index([client])
}

model Task {
  id               String       @id @default(cuid())
  title            String
  instructions     String?
  strategy         TaskStrategy @default(Create)
  status           TaskStatus   @default(NotStarted)
  priority         Priority     @default(Medium)
  client           String?
  projectId        String?
  assignedToId     String
  assignedById     String
  dueDate          DateTime?
  links            String?
  emailSent        Boolean      @default(false)
  relatedSops      Json?
  relatedTrainings Json?
  suggestedTools   Json?
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  project    Project?      @relation(fields: [projectId], references: [id])
  assignedTo User          @relation("TaskAssignee", fields: [assignedToId], references: [id])
  assignedBy User          @relation("TaskCreator", fields: [assignedById], references: [id])
  comments   TaskComment[]

  @@index([assignedToId])
  @@index([projectId])
  @@index([status])
  @@index([client])
}

model TaskComment {
  id        String   @id @default(cuid())
  taskId    String
  authorId  String
  body      String
  createdAt DateTime @default(now())

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation("TaskCommentAuthor", fields: [authorId], references: [id])

  @@index([taskId])
}

model ProjectComment {
  id        String   @id @default(cuid())
  projectId String
  authorId  String
  body      String
  createdAt DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  author  User    @relation("ProjectCommentAuthor", fields: [authorId], references: [id])

  @@index([projectId])
}
```

- [ ] **Step 3: Add 6 back-relations to the User model**

Inside the existing `model User { ... }` block, add after the existing fields (before the closing `}`):

```prisma
  projectsOwned    Project[]        @relation("ProjectOwner")
  projectsCreated  Project[]        @relation("ProjectCreator")
  tasksAssigned    Task[]           @relation("TaskAssignee")
  tasksCreated     Task[]           @relation("TaskCreator")
  taskComments     TaskComment[]    @relation("TaskCommentAuthor")
  projectComments  ProjectComment[] @relation("ProjectCommentAuthor")
```

- [ ] **Step 4: Run Prisma generate to validate the schema**

```bash
cd /Users/justinokamoto/Documents/va-management-next
npx prisma generate
```

Expected: `Generated Prisma Client ...` with no errors.

- [ ] **Step 5: Create and apply the migration**

```bash
npx prisma migrate dev --name add_projects_and_tasks
```

Expected: `The following migration(s) have been applied: .../add_projects_and_tasks`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add Project, Task, TaskComment, ProjectComment models + enums"
```

---

## Task 2: Role helpers

**Files:**
- Modify: `src/lib/auth/roles.ts`

- [ ] **Step 1: Add canManageTasks, isTaskDelegator, canManageProjects after `canDecideHire`**

```typescript
/** Roles that can create tasks and assign them to VAs. */
export function canManageTasks(role: Role): boolean {
  return (
    role === "HR_MANAGER" ||
    role === "PEOPLE_OPS" ||
    role === "TEAM_LEAD" ||
    role === "SENIOR_VA"
  );
}

/** Alias for canManageTasks — used in delegation-specific contexts. */
export function isTaskDelegator(role: Role): boolean {
  return canManageTasks(role);
}

/** Roles that can create, edit, and delete projects. SENIOR_VA is excluded. */
export function canManageProjects(role: Role): boolean {
  return role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/roles.ts
git commit -m "feat(auth): add canManageTasks, canManageProjects role helpers"
```

---

## Task 3: Pure service functions (TDD)

**Files:**
- Create: `tests/tasks.test.ts`
- Create: `src/lib/services/tasks.ts`

- [ ] **Step 1: Write the failing tests in tests/tasks.test.ts**

```typescript
import test from "node:test";
import assert from "node:assert/strict";

import {
  sortTasksByUrgency,
  computeProjectProgress,
  canUserActOnTask,
  inheritTaskClient,
} from "../src/lib/services/tasks";

// ── sortTasksByUrgency ──────────────────────────────────────────────────────

const now = new Date("2025-01-15T12:00:00Z");

test("sortTasksByUrgency: overdue tasks come first", () => {
  const overdue = { id: "a", dueDate: new Date("2025-01-14T00:00:00Z"), status: "InProgress" as const };
  const later = { id: "b", dueDate: new Date("2025-02-01T00:00:00Z"), status: "NotStarted" as const };
  const result = sortTasksByUrgency([later, overdue], now);
  assert.equal(result[0].id, "a");
});

test("sortTasksByUrgency: due this week comes before later", () => {
  const thisWeek = { id: "a", dueDate: new Date("2025-01-17T00:00:00Z"), status: "InProgress" as const };
  const later = { id: "b", dueDate: new Date("2025-02-01T00:00:00Z"), status: "NotStarted" as const };
  const result = sortTasksByUrgency([later, thisWeek], now);
  assert.equal(result[0].id, "a");
});

test("sortTasksByUrgency: null dueDate sorts last", () => {
  const noDue = { id: "a", dueDate: null, status: "NotStarted" as const };
  const later = { id: "b", dueDate: new Date("2025-02-01T00:00:00Z"), status: "InProgress" as const };
  const result = sortTasksByUrgency([noDue, later], now);
  assert.equal(result[0].id, "b");
});

test("sortTasksByUrgency: done tasks always sort after not-done with same bucket", () => {
  const done = { id: "a", dueDate: new Date("2025-01-14T00:00:00Z"), status: "Done" as const };
  const active = { id: "b", dueDate: new Date("2025-01-14T00:00:00Z"), status: "InProgress" as const };
  const result = sortTasksByUrgency([done, active], now);
  assert.equal(result[0].id, "b");
});

// ── computeProjectProgress ─────────────────────────────────────────────────

test("computeProjectProgress: returns 0 for empty list", () => {
  assert.equal(computeProjectProgress([]), 0);
});

test("computeProjectProgress: all done = 100", () => {
  const tasks = [{ status: "Done" as const }, { status: "Done" as const }];
  assert.equal(computeProjectProgress(tasks), 100);
});

test("computeProjectProgress: half done = 50", () => {
  const tasks = [{ status: "Done" as const }, { status: "NotStarted" as const }];
  assert.equal(computeProjectProgress(tasks), 50);
});

test("computeProjectProgress: rounds to nearest integer", () => {
  const tasks = [
    { status: "Done" as const },
    { status: "NotStarted" as const },
    { status: "NotStarted" as const },
  ];
  assert.equal(computeProjectProgress(tasks), 33);
});

// ── canUserActOnTask ───────────────────────────────────────────────────────

test("canUserActOnTask: HR_MANAGER can act on any task", () => {
  assert.equal(canUserActOnTask("user1", "HR_MANAGER", { assignedToId: "other", assignedById: "other2" }), true);
});

test("canUserActOnTask: VA can act on their own assigned task", () => {
  assert.equal(canUserActOnTask("user1", "VA", { assignedToId: "user1", assignedById: "other" }), true);
});

test("canUserActOnTask: VA cannot act on someone else's task", () => {
  assert.equal(canUserActOnTask("user1", "VA", { assignedToId: "other", assignedById: "also-other" }), false);
});

// ── inheritTaskClient ──────────────────────────────────────────────────────

test("inheritTaskClient: uses task client when set", () => {
  assert.equal(inheritTaskClient("ClientA", "ClientB"), "ClientA");
});

test("inheritTaskClient: falls back to project client when task client is null", () => {
  assert.equal(inheritTaskClient(null, "ClientB"), "ClientB");
});

test("inheritTaskClient: returns null when both are null", () => {
  assert.equal(inheritTaskClient(null, null), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/tasks.test.ts
```

Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/lib/services/tasks'`

- [ ] **Step 3: Implement src/lib/services/tasks.ts**

```typescript
import type { TaskStatus } from "@prisma/client";

type UrgencyTask = { id: string; dueDate: Date | null; status: TaskStatus };

function urgencyBucket(task: UrgencyTask, now: Date): number {
  if (task.status === "Done") return 3;
  if (!task.dueDate) return 2;
  if (task.dueDate < now) return 0;
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (task.dueDate <= sevenDays) return 1;
  return 2;
}

export function sortTasksByUrgency<T extends UrgencyTask>(tasks: T[], now: Date = new Date()): T[] {
  return [...tasks].sort((a, b) => urgencyBucket(a, now) - urgencyBucket(b, now));
}

type ProgressTask = { status: TaskStatus };

export function computeProjectProgress(tasks: ProgressTask[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === "Done").length;
  return Math.round((done / tasks.length) * 100);
}

type ActTask = { assignedToId: string; assignedById: string };

const MANAGER_ROLES = new Set(["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD", "SENIOR_VA"]);

export function canUserActOnTask(userId: string, role: string, task: ActTask): boolean {
  if (MANAGER_ROLES.has(role)) return true;
  return task.assignedToId === userId || task.assignedById === userId;
}

export function inheritTaskClient(
  taskClient: string | null | undefined,
  projectClient: string | null | undefined,
): string | null {
  return taskClient ?? projectClient ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/tasks.test.ts
```

Expected:
```
✔ sortTasksByUrgency: overdue tasks come first (...)
✔ sortTasksByUrgency: due this week comes before later (...)
...
ℹ tests 13
ℹ pass 13
ℹ fail 0
```

- [ ] **Step 5: Commit**

```bash
git add tests/tasks.test.ts src/lib/services/tasks.ts
git commit -m "feat(services): add sortTasksByUrgency, computeProjectProgress, canUserActOnTask, inheritTaskClient"
```

---

## Task 4: Notion picker

**Files:**
- Create: `src/lib/notion-picker.ts`

- [ ] **Step 1: Create src/lib/notion-picker.ts**

```typescript
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIRROR_DIR =
  process.env.NOTION_MIRROR_DIR ??
  "/Users/justinokamoto/SecondBrain/tools/notion-mirror/notion_raw";

export type SopEntry = { notionPageId: string; title: string; url: string };
export type TrainingEntry = { notionPageId: string; title: string; url: string };
export type ToolEntry = { notionPageId: string; title: string; url: string; category: string };

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^"(.*)"$/, "$1");
    result[key] = val;
  }
  return result;
}

function readNotionDb<T>(
  dbSlugPrefix: string,
  mapFn: (fm: Record<string, string>) => T | null,
): T[] {
  let dirs: string[];
  try {
    dirs = readdirSync(MIRROR_DIR).filter((d) => d.startsWith(dbSlugPrefix));
  } catch {
    return [];
  }
  const results: T[] = [];
  for (const dir of dirs) {
    const dirPath = join(MIRROR_DIR, dir);
    let files: string[];
    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const content = readFileSync(join(dirPath, file), "utf8");
        const fm = parseFrontmatter(content);
        const entry = mapFn(fm);
        if (entry) results.push(entry);
      } catch {
        // skip unreadable files
      }
    }
  }
  return results;
}

export function readSopPicker(): SopEntry[] {
  return readNotionDb("sop-library--", (fm) => {
    if (!fm.notion_page_id || !fm.title || !fm.notion_url) return null;
    return { notionPageId: fm.notion_page_id, title: fm.title, url: fm.notion_url };
  });
}

export function readTrainingPicker(): TrainingEntry[] {
  return readNotionDb("training--", (fm) => {
    if (!fm.notion_page_id || !fm.title || !fm.notion_url) return null;
    return { notionPageId: fm.notion_page_id, title: fm.title, url: fm.notion_url };
  });
}

const STATIC_TOOLS: ToolEntry[] = [
  { notionPageId: "static-canva", title: "Canva", url: "https://canva.com", category: "Design" },
  { notionPageId: "static-chatgpt", title: "ChatGPT", url: "https://chat.openai.com", category: "AI" },
  { notionPageId: "static-claude", title: "Claude", url: "https://claude.ai", category: "AI" },
  { notionPageId: "static-claude-code", title: "Claude Code", url: "https://claude.ai/code", category: "Dev" },
  { notionPageId: "static-notion", title: "Notion", url: "https://notion.so", category: "Productivity" },
  { notionPageId: "static-gmail", title: "Gmail", url: "https://mail.google.com", category: "Communication" },
  { notionPageId: "static-gdocs", title: "Google Docs", url: "https://docs.google.com", category: "Productivity" },
  { notionPageId: "static-gsheets", title: "Google Sheets", url: "https://sheets.google.com", category: "Productivity" },
  { notionPageId: "static-gslides", title: "Google Slides", url: "https://slides.google.com", category: "Productivity" },
  { notionPageId: "static-loom", title: "Loom", url: "https://loom.com", category: "Communication" },
  { notionPageId: "static-zoom", title: "Zoom", url: "https://zoom.us", category: "Communication" },
  { notionPageId: "static-trello", title: "Trello", url: "https://trello.com", category: "Productivity" },
  { notionPageId: "static-slack", title: "Slack", url: "https://slack.com", category: "Communication" },
  { notionPageId: "static-figma", title: "Figma", url: "https://figma.com", category: "Design" },
  { notionPageId: "static-airtable", title: "Airtable", url: "https://airtable.com", category: "Productivity" },
];

export function readToolsPicker(): ToolEntry[] {
  const fromNotion = readNotionDb<ToolEntry>("tools--", (fm) => {
    if (!fm.notion_page_id || !fm.title || !fm.notion_url) return null;
    return {
      notionPageId: fm.notion_page_id,
      title: fm.title,
      url: fm.notion_url,
      category: fm.category ?? "Productivity",
    };
  });
  return fromNotion.length > 0 ? fromNotion : STATIC_TOOLS;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notion-picker.ts
git commit -m "feat: add Notion picker for SOPs, Trainings, Tools (static fallback for Tools)"
```

---

## Task 5: Reads — projects

**Files:**
- Create: `src/lib/reads/projects.ts`

- [ ] **Step 1: Create src/lib/reads/projects.ts**

```typescript
import { db } from "@/lib/db";
import { computeProjectProgress } from "@/lib/services/tasks";

export type ProjectListItem = Awaited<ReturnType<typeof getProjectsList>>[number];
export type ProjectDetail = Awaited<ReturnType<typeof getProjectDetail>>;
export type ActivityFeedItem = Awaited<ReturnType<typeof getProjectActivityFeed>>[number];

export async function getProjectsList() {
  const projects = await db.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      tasks: { select: { status: true } },
    },
  });
  return projects.map((p) => ({
    ...p,
    progress: computeProjectProgress(p.tasks),
    taskCount: p.tasks.length,
    openTaskCount: p.tasks.filter((t) => t.status !== "Done").length,
  }));
}

export async function getProjectDetail(projectId: string) {
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      tasks: {
        orderBy: { createdAt: "asc" },
        include: {
          assignedTo: { select: { id: true, name: true } },
          assignedBy: { select: { id: true, name: true } },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true } } },
          },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function getProjectActivityFeed(projectId: string) {
  const [taskComments, projectComments, recentStatusChanges] = await Promise.all([
    db.taskComment.findMany({
      where: { task: { projectId } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        author: { select: { name: true } },
        task: { select: { title: true } },
      },
    }),
    db.projectComment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { author: { select: { name: true } } },
    }),
    db.task.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, status: true, updatedAt: true, assignedTo: { select: { name: true } } },
    }),
  ]);

  type FeedItem = { id: string; type: string; summary: string; at: Date };
  const items: FeedItem[] = [
    ...taskComments.map((c) => ({
      id: `tc-${c.id}`,
      type: "task_comment",
      summary: `${c.author.name ?? "Someone"} commented on "${c.task.title}": ${c.body.slice(0, 80)}`,
      at: c.createdAt,
    })),
    ...projectComments.map((c) => ({
      id: `pc-${c.id}`,
      type: "project_comment",
      summary: `${c.author.name ?? "Someone"} posted a note: ${c.body.slice(0, 80)}`,
      at: c.createdAt,
    })),
    ...recentStatusChanges.map((t) => ({
      id: `ts-${t.id}`,
      type: "task_status",
      summary: `"${t.title}" is now ${t.status} (${t.assignedTo.name ?? "unassigned"})`,
      at: t.updatedAt,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 30);
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reads/projects.ts
git commit -m "feat(reads): add getProjectsList, getProjectDetail, getProjectActivityFeed"
```

---

## Task 6: Reads — tasks

**Files:**
- Create: `src/lib/reads/tasks.ts`

- [ ] **Step 1: Create src/lib/reads/tasks.ts**

```typescript
import { db } from "@/lib/db";
import { sortTasksByUrgency } from "@/lib/services/tasks";

export type TaskListItem = Awaited<ReturnType<typeof getMyTasks>>[number];
export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  assignedBy: { select: { id: true, name: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true } } },
  },
} as const;

export async function getMyTasks(userId: string) {
  const tasks = await db.task.findMany({
    where: { assignedToId: userId },
    include: TASK_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return sortTasksByUrgency(tasks);
}

export async function getAllTasks(opts?: {
  assignedToId?: string;
  status?: string;
  client?: string;
}) {
  return db.task.findMany({
    where: {
      ...(opts?.assignedToId ? { assignedToId: opts.assignedToId } : {}),
      ...(opts?.status ? { status: opts.status as never } : {}),
      ...(opts?.client ? { client: { contains: opts.client, mode: "insensitive" as const } } : {}),
    },
    include: TASK_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getTaskDetail(taskId: string) {
  return db.task.findUnique({
    where: { id: taskId },
    include: TASK_INCLUDE,
  });
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reads/tasks.ts
git commit -m "feat(reads): add getMyTasks, getAllTasks, getTaskDetail"
```

---

## Task 7: Actions — projects

**Files:**
- Create: `src/lib/actions/projects.ts`

- [ ] **Step 1: Create src/lib/actions/projects.ts**

```typescript
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { canManageProjects, AuthorizationError } from "@/lib/auth/roles";
import type { Role, ProjectStatus, ProjectType, Priority } from "@prisma/client";

export type CreateProjectInput = {
  name: unknown;
  description?: unknown;
  status?: unknown;
  type?: unknown;
  priority?: unknown;
  client?: unknown;
  ownerId?: unknown;
  dueDate?: unknown;
  links?: unknown;
};

export type UpdateProjectInput = Partial<CreateProjectInput>;

function requireText(val: unknown, field: string): string {
  if (typeof val !== "string" || !val.trim()) throw new Error(`${field} is required`);
  return val.trim();
}
function optionalText(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}
function optionalDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function createProject(
  actorId: string,
  actorRole: Role,
  input: CreateProjectInput,
) {
  if (!canManageProjects(actorRole)) throw new AuthorizationError("Only HR managers and team leads can create projects");

  const name = requireText(input.name, "name");
  const ownerId = optionalText(input.ownerId) ?? actorId;

  const project = await db.project.create({
    data: {
      name,
      description: optionalText(input.description),
      status: (optionalText(input.status) as ProjectStatus | undefined) ?? "Planning",
      type: (optionalText(input.type) as ProjectType | undefined) ?? "Project",
      priority: (optionalText(input.priority) as Priority | undefined) ?? "Medium",
      client: optionalText(input.client),
      ownerId,
      createdById: actorId,
      dueDate: optionalDate(input.dueDate),
      links: optionalText(input.links),
    },
    select: { id: true, name: true },
  });

  await logActivity({
    source: "project_action",
    eventType: "project_created",
    severity: "success",
    summary: `Project "${project.name}" created.`,
  });

  return project;
}

export async function updateProject(
  actorId: string,
  actorRole: Role,
  projectId: string,
  input: UpdateProjectInput,
) {
  if (!canManageProjects(actorRole)) throw new AuthorizationError("Only HR managers and team leads can update projects");

  const project = await db.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: requireText(input.name, "name") } : {}),
      ...(input.description !== undefined ? { description: optionalText(input.description) } : {}),
      ...(input.status !== undefined ? { status: optionalText(input.status) as ProjectStatus } : {}),
      ...(input.type !== undefined ? { type: optionalText(input.type) as ProjectType } : {}),
      ...(input.priority !== undefined ? { priority: optionalText(input.priority) as Priority } : {}),
      ...(input.client !== undefined ? { client: optionalText(input.client) } : {}),
      ...(input.ownerId !== undefined ? { ownerId: optionalText(input.ownerId) ?? actorId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: optionalDate(input.dueDate) } : {}),
      ...(input.links !== undefined ? { links: optionalText(input.links) } : {}),
    },
    select: { id: true, name: true },
  });

  await logActivity({
    source: "project_action",
    eventType: "project_updated",
    severity: "info",
    summary: `Project "${project.name}" updated.`,
  });

  return project;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/projects.ts
git commit -m "feat(actions): createProject, updateProject"
```

---

## Task 8: Actions — tasks (with email notification)

**Files:**
- Create: `src/lib/actions/tasks.ts`

- [ ] **Step 1: Create src/lib/actions/tasks.ts**

```typescript
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, str as settingStr } from "@/lib/settings";
import { canManageTasks, AuthorizationError } from "@/lib/auth/roles";
import { inheritTaskClient } from "@/lib/services/tasks";
import type { Role, TaskStatus, TaskStrategy, Priority } from "@prisma/client";

export type CreateTaskInput = {
  title: unknown;
  instructions?: unknown;
  strategy?: unknown;
  priority?: unknown;
  client?: unknown;
  projectId?: unknown;
  assignedToId: unknown;
  dueDate?: unknown;
  links?: unknown;
  relatedSops?: unknown;
  relatedTrainings?: unknown;
  suggestedTools?: unknown;
};

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, "assignedToId"> & { status?: unknown }>;

function requireText(val: unknown, field: string): string {
  if (typeof val !== "string" || !val.trim()) throw new Error(`${field} is required`);
  return val.trim();
}
function optionalText(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}
function optionalDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? undefined : d;
}

async function sendTaskAssignmentEmail(opts: {
  from: string;
  toEmail: string;
  toName: string | null;
  taskId: string;
  taskTitle: string;
  strategy: string;
  priority: string;
  dueDate: Date | null | undefined;
  assignedByName: string | null;
  instructions: string | null | undefined;
  links: string | null | undefined;
}): Promise<boolean> {
  const dueDateStr = opts.dueDate
    ? opts.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "No due date";

  const body = [
    `Hi ${opts.toName ?? "there"},`,
    ``,
    `You have been assigned a new task.`,
    ``,
    `Title: ${opts.taskTitle}`,
    `Strategy: ${opts.strategy}`,
    `Priority: ${opts.priority}`,
    `Due: ${dueDateStr}`,
    `Assigned by: ${opts.assignedByName ?? "Team"}`,
    ``,
    opts.instructions ? `Instructions:\n${opts.instructions}` : null,
    opts.links ? `\nLinks: ${opts.links}` : null,
    ``,
    `View task: https://team.pwasecondbrain.uk/va/tasks/${opts.taskId}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const result = await sendSystemEmail({
    from: opts.from,
    to: opts.toEmail,
    subject: `📋 New task assigned: ${opts.taskTitle}`,
    body,
  });
  return result.ok;
}

export async function createTask(actorId: string, actorRole: Role, input: CreateTaskInput) {
  if (!canManageTasks(actorRole)) throw new AuthorizationError("Only team leads and senior VAs can assign tasks");

  const title = requireText(input.title, "title");
  const assignedToId = requireText(input.assignedToId, "assignedToId");

  // Resolve client: task-level client or inherit from project
  let projectClient: string | null = null;
  const projectId = optionalText(input.projectId);
  if (projectId) {
    const proj = await db.project.findUnique({ where: { id: projectId }, select: { client: true } });
    projectClient = proj?.client ?? null;
  }
  const client = inheritTaskClient(optionalText(input.client), projectClient) ?? undefined;

  const task = await db.task.create({
    data: {
      title,
      instructions: optionalText(input.instructions),
      strategy: (optionalText(input.strategy) as TaskStrategy | undefined) ?? "Create",
      priority: (optionalText(input.priority) as Priority | undefined) ?? "Medium",
      client,
      projectId: projectId ?? null,
      assignedToId,
      assignedById: actorId,
      dueDate: optionalDate(input.dueDate),
      links: optionalText(input.links),
      relatedSops: input.relatedSops ?? null,
      relatedTrainings: input.relatedTrainings ?? null,
      suggestedTools: input.suggestedTools ?? null,
    },
    include: {
      assignedTo: { select: { email: true, name: true } },
      assignedBy: { select: { name: true } },
    },
  });

  // Send assignment email (best-effort — task is always saved)
  const settings = await loadSettings();
  const from = settingStr(settings, "system_email_from");
  let emailSent = false;
  if (from && task.assignedTo.email) {
    emailSent = await sendTaskAssignmentEmail({
      from,
      toEmail: task.assignedTo.email,
      toName: task.assignedTo.name,
      taskId: task.id,
      taskTitle: task.title,
      strategy: task.strategy,
      priority: task.priority,
      dueDate: task.dueDate,
      assignedByName: task.assignedBy.name,
      instructions: task.instructions,
      links: task.links,
    });
    if (emailSent) {
      await db.task.update({ where: { id: task.id }, data: { emailSent: true } });
    }
  }

  await logActivity({
    source: "task_action",
    eventType: "task_assigned",
    severity: "success",
    summary: `Task "${task.title}" assigned to ${task.assignedTo.name ?? task.assignedTo.email}.`,
  });

  return { ...task, emailSent };
}

export async function updateTaskStatus(
  actorId: string,
  actorRole: Role,
  taskId: string,
  status: TaskStatus,
) {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { assignedToId: true, assignedById: true, title: true },
  });

  const isManager = ["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD", "SENIOR_VA"].includes(actorRole);
  const isParticipant = task.assignedToId === actorId || task.assignedById === actorId;
  if (!isManager && !isParticipant) throw new AuthorizationError("You are not allowed to update this task");

  const updated = await db.task.update({
    where: { id: taskId },
    data: { status },
    select: { id: true, title: true, status: true },
  });

  await logActivity({
    source: "task_action",
    eventType: "task_status_changed",
    severity: "info",
    summary: `Task "${updated.title}" status changed to ${status}.`,
  });

  return updated;
}

export async function updateTask(
  actorId: string,
  actorRole: Role,
  taskId: string,
  input: UpdateTaskInput,
) {
  if (!canManageTasks(actorRole)) throw new AuthorizationError("Only team leads and senior VAs can edit tasks");

  const task = await db.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: requireText(input.title, "title") } : {}),
      ...(input.instructions !== undefined ? { instructions: optionalText(input.instructions) } : {}),
      ...(input.strategy !== undefined ? { strategy: optionalText(input.strategy) as TaskStrategy } : {}),
      ...(input.priority !== undefined ? { priority: optionalText(input.priority) as Priority } : {}),
      ...(input.status !== undefined ? { status: optionalText(input.status) as TaskStatus } : {}),
      ...(input.client !== undefined ? { client: optionalText(input.client) } : {}),
      ...(input.dueDate !== undefined ? { dueDate: optionalDate(input.dueDate) } : {}),
      ...(input.links !== undefined ? { links: optionalText(input.links) } : {}),
      ...(input.relatedSops !== undefined ? { relatedSops: input.relatedSops } : {}),
      ...(input.relatedTrainings !== undefined ? { relatedTrainings: input.relatedTrainings } : {}),
      ...(input.suggestedTools !== undefined ? { suggestedTools: input.suggestedTools } : {}),
    },
    select: { id: true, title: true },
  });

  await logActivity({
    source: "task_action",
    eventType: "task_updated",
    severity: "info",
    summary: `Task "${task.title}" updated.`,
  });

  return task;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/tasks.ts
git commit -m "feat(actions): createTask (with email notification), updateTaskStatus, updateTask"
```

---

## Task 9: Actions — comments

**Files:**
- Create: `src/lib/actions/comments.ts`

- [ ] **Step 1: Create src/lib/actions/comments.ts**

```typescript
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { canManageTasks, AuthorizationError } from "@/lib/auth/roles";
import type { Role } from "@prisma/client";

export async function addTaskComment(
  actorId: string,
  actorRole: Role,
  taskId: string,
  body: string,
) {
  if (!body.trim()) throw new Error("Comment body cannot be empty");

  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { assignedToId: true, assignedById: true, title: true },
  });

  const isManager = canManageTasks(actorRole);
  const isParticipant = task.assignedToId === actorId || task.assignedById === actorId;
  if (!isManager && !isParticipant) {
    throw new AuthorizationError("You are not allowed to comment on this task");
  }

  const comment = await db.taskComment.create({
    data: { taskId, authorId: actorId, body: body.trim() },
    include: { author: { select: { id: true, name: true } } },
  });

  await logActivity({
    source: "comment_action",
    eventType: "task_comment_added",
    severity: "info",
    summary: `Comment added on task "${task.title}".`,
  });

  return comment;
}

export async function addProjectComment(
  actorId: string,
  actorRole: Role,
  projectId: string,
  body: string,
) {
  if (!canManageTasks(actorRole)) {
    throw new AuthorizationError("Only team managers can post project notes");
  }
  if (!body.trim()) throw new Error("Comment body cannot be empty");

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true },
  });

  const comment = await db.projectComment.create({
    data: { projectId, authorId: actorId, body: body.trim() },
    include: { author: { select: { id: true, name: true } } },
  });

  await logActivity({
    source: "comment_action",
    eventType: "project_comment_added",
    severity: "info",
    summary: `Note added on project "${project.name}".`,
  });

  return comment;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/comments.ts
git commit -m "feat(actions): addTaskComment, addProjectComment"
```

---

## Task 10: Sidebar navigation

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add "Projects" group to the HR NAV section**

In `src/components/Sidebar.tsx`, find the `HR` key in the `NAV` object. Add a new section object after the existing `"Manage"` section:

```typescript
{
  label: "Projects",
  items: [
    { href: "/hr/projects", label: "Projects" },
    { href: "/hr/tasks", label: "All Tasks" },
    { href: "/hr/tasks/new", label: "Delegate" },
  ],
},
```

- [ ] **Step 2: Add "My Tasks" to the VA My Console section**

Find the `VA` key in `NAV`. Inside the `"My Console"` section's `items` array, add after the last existing item:

```typescript
{ href: "/va/tasks", label: "My Tasks" },
```

The final VA section should look like:

```typescript
VA: [
  {
    label: "My Console",
    items: [
      { href: "/va", label: "Overview" },
      { href: "/va/tier", label: "Tier Progress" },
      { href: "/va/evaluation", label: "Evaluation" },
      { href: "/va/checkin", label: "Monthly Check-in" },
      { href: "/va/tasks", label: "My Tasks" },
    ],
  },
],
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(nav): add Projects group to HR sidebar, My Tasks to VA sidebar"
```

---

## Task 11: HR — Projects list page

**Files:**
- Create: `src/app/(app)/hr/projects/page.tsx`

- [ ] **Step 1: Create src/app/(app)/hr/projects/page.tsx**

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getProjectsList } from "@/lib/reads/projects";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function HrProjectsPage() {
  const user = await getCurrentUser();
  if (!canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const projects = await getProjectsList();

  const activeCount = projects.filter((p) => p.status === "Active").length;
  const openTaskCount = projects.reduce((s, p) => s + p.openTaskCount, 0);
  const overdueCount = projects.filter(
    (p) => p.dueDate && p.dueDate < new Date() && p.status !== "Done",
  ).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Projects</div>
          <h1>Projects</h1>
        </div>
        <a href="/hr/tasks/new" className="btn btn-primary" style={{ alignSelf: "center" }}>
          + Delegate Task
        </a>
      </div>

      <div className="stat-grid">
        <Stat label="Active projects" value={activeCount} variant={activeCount ? "navy" : "default"} />
        <Stat label="Open tasks" value={openTaskCount} />
        <Stat label="Overdue projects" value={overdueCount} trend={overdueCount ? "down" : "neutral"} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
        {projects.length === 0 ? (
          <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>No projects yet.</p>
        ) : (
          projects.map((p) => (
            <Card key={p.id} padding={20}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <a
                    href={`/hr/projects/${p.id}`}
                    style={{ fontWeight: 600, fontSize: "var(--text-base)", textDecoration: "none" }}
                  >
                    {p.name}
                  </a>
                  {p.client && (
                    <span className="small" style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>
                      {p.client}
                    </span>
                  )}
                  <div className="small" style={{ marginTop: 4, color: "var(--color-text-secondary)" }}>
                    {p.owner.name ?? p.owner.email} ·{" "}
                    {p.dueDate ? `Due ${p.dueDate.toLocaleDateString()}` : "No due date"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge variant={p.priority === "High" ? "danger" : p.priority === "Medium" ? "warning" : "default"}>
                    {p.priority}
                  </Badge>
                  <Badge variant={p.status === "Active" ? "primary" : p.status === "Done" ? "info" : "default"}>
                    {p.status}
                  </Badge>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 4,
                    background: "var(--color-border)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${p.progress}%`,
                      background: "var(--color-sky-500)",
                      borderRadius: 4,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div className="small" style={{ marginTop: 4, color: "var(--color-text-tertiary)" }}>
                  {p.progress}% complete · {p.openTaskCount} open tasks
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck and build**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/hr/projects/page.tsx
git commit -m "feat(pages): HR projects list page"
```

---

## Task 12: HR — Project detail page

**Files:**
- Create: `src/app/(app)/hr/projects/[id]/page.tsx`

- [ ] **Step 1: Create src/app/(app)/hr/projects/[id]/page.tsx**

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getProjectDetail, getProjectActivityFeed } from "@/lib/reads/projects";
import { computeProjectProgress } from "@/lib/services/tasks";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const [project, feed] = await Promise.all([
    getProjectDetail(id),
    getProjectActivityFeed(id),
  ]);

  if (!project) return <p style={{ padding: 32 }}>Project not found.</p>;

  const progress = computeProjectProgress(project.tasks);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href="/hr/projects">Projects</a> / {project.name}
          </div>
          <h1>{project.name}</h1>
          {project.client && (
            <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
              {project.client}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignSelf: "center" }}>
          <Badge variant={project.status === "Active" ? "primary" : "default"}>{project.status}</Badge>
          <Badge variant={project.priority === "High" ? "danger" : "warning"}>{project.priority}</Badge>
        </div>
      </div>

      {project.description && (
        <p style={{ marginBottom: 24, color: "var(--color-text-secondary)" }}>{project.description}</p>
      )}

      <div className="dash-grid">
        {/* Task list */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Tasks</h2>
            <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
              {progress}% complete
            </span>
          </div>
          {project.tasks.length === 0 ? (
            <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>No tasks yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {project.tasks.map((t) => (
                <Card key={t.id} padding={16}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <a
                        href={`/hr/tasks/${t.id}`}
                        style={{ fontWeight: 600, textDecoration: "none" }}
                      >
                        {t.title}
                      </a>
                      <div className="small" style={{ marginTop: 2, color: "var(--color-text-tertiary)" }}>
                        {t.assignedTo.name ?? t.assignedTo.email} ·{" "}
                        {t.dueDate ? `Due ${t.dueDate.toLocaleDateString()}` : "No due date"}
                      </div>
                    </div>
                    <Badge
                      variant={
                        t.status === "Done" ? "info" : t.status === "Blocked" ? "danger" : "default"
                      }
                    >
                      {t.status}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Activity</h2>
          </div>
          <div style={{ padding: 8 }}>
            {feed.length === 0 ? (
              <p
                style={{
                  padding: 24,
                  color: "var(--color-text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                No activity yet.
              </p>
            ) : (
              feed.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px dashed var(--color-border-subtle)",
                  }}
                >
                  <div style={{ fontSize: "var(--text-sm)" }}>{item.summary}</div>
                  <div className="small" style={{ color: "var(--color-text-tertiary)", marginTop: 2 }}>
                    {item.at.toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/hr/projects/[id]/page.tsx"
git commit -m "feat(pages): HR project detail page with task list and activity feed"
```

---

## Task 13: HR — All Tasks page

**Files:**
- Create: `src/app/(app)/hr/tasks/page.tsx`

- [ ] **Step 1: Create src/app/(app)/hr/tasks/page.tsx**

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getAllTasks } from "@/lib/reads/tasks";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function HrTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string; va?: string }>;
}) {
  const { status, client, va } = await searchParams;
  const user = await getCurrentUser();
  if (!canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const tasks = await getAllTasks({
    ...(status ? { status } : {}),
    ...(client ? { client } : {}),
    ...(va ? { assignedToId: va } : {}),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Projects</div>
          <h1>All Tasks</h1>
        </div>
        <a href="/hr/tasks/new" className="btn btn-primary" style={{ alignSelf: "center" }}>
          + Delegate Task
        </a>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["NotStarted", "InProgress", "Blocked", "Done"] as const).map((s) => (
          <a
            key={s}
            href={status === s ? "/hr/tasks" : `/hr/tasks?status=${s}`}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid var(--color-border)",
              fontSize: "var(--text-sm)",
              textDecoration: "none",
              background: status === s ? "var(--color-sky-500)" : undefined,
              color: status === s ? "#fff" : undefined,
            }}
          >
            {s}
          </a>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.length === 0 ? (
          <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>No tasks found.</p>
        ) : (
          tasks.map((t) => (
            <Card key={t.id} padding={16}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <a href={`/hr/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                    {t.title}
                  </a>
                  <div className="small" style={{ marginTop: 2, color: "var(--color-text-secondary)" }}>
                    {t.assignedTo.name ?? t.assignedTo.email}
                    {t.project ? ` · ${t.project.name}` : ""}
                    {t.client ? ` · ${t.client}` : ""}
                    {" · "}
                    {t.dueDate ? `Due ${t.dueDate.toLocaleDateString()}` : "No due date"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Badge variant="default">{t.strategy}</Badge>
                  <Badge
                    variant={
                      t.status === "Done" ? "info" : t.status === "Blocked" ? "danger" : "default"
                    }
                  >
                    {t.status}
                  </Badge>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/hr/tasks/page.tsx"
git commit -m "feat(pages): HR all-tasks list with status filter"
```

---

## Task 14: HR — Task detail page (manager view)

**Files:**
- Create: `src/app/(app)/hr/tasks/[id]/page.tsx`

- [ ] **Step 1: Create src/app/(app)/hr/tasks/[id]/page.tsx**

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getTaskDetail } from "@/lib/reads/tasks";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function HrTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const task = await getTaskDetail(id);
  if (!task) return <p style={{ padding: 32 }}>Task not found.</p>;

  const sops = (task.relatedSops as { title: string; url: string }[] | null) ?? [];
  const trainings = (task.relatedTrainings as { title: string; url: string }[] | null) ?? [];
  const tools = (task.suggestedTools as { title: string; url: string; category: string }[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href="/hr/tasks">All Tasks</a> / {task.title}
          </div>
          <h1>{task.title}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignSelf: "center" }}>
          <Badge variant={task.status === "Done" ? "info" : task.status === "Blocked" ? "danger" : "default"}>
            {task.status}
          </Badge>
          <Badge variant={task.priority === "High" ? "danger" : "warning"}>{task.priority}</Badge>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Row label="Assigned to" value={task.assignedTo.name ?? task.assignedTo.email} />
              <Row label="Assigned by" value={task.assignedBy.name ?? "—"} />
              <Row label="Strategy" value={task.strategy} />
              <Row label="Due date" value={task.dueDate?.toLocaleDateString() ?? "—"} />
              {task.client && <Row label="Client" value={task.client} />}
              {task.project && <Row label="Project" value={task.project.name} />}
            </div>
          </Card>

          {task.instructions && (
            <Card padding={20}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Instructions</h3>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{task.instructions}</p>
            </Card>
          )}

          {(sops.length > 0 || trainings.length > 0 || tools.length > 0) && (
            <Card padding={20}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Resources</h3>
              {sops.length > 0 && (
                <ResourceList label="Related SOPs" items={sops} />
              )}
              {trainings.length > 0 && (
                <ResourceList label="Related Trainings" items={trainings} />
              )}
              {tools.length > 0 && (
                <ResourceList label="Suggested Tools" items={tools} />
              )}
            </Card>
          )}
        </div>

        {/* Comments */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Comments</h2>
          </div>
          <div style={{ padding: 8 }}>
            {task.comments.length === 0 ? (
              <p style={{ padding: 24, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                No comments yet.
              </p>
            ) : (
              task.comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px dashed var(--color-border-subtle)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                    {c.author.name ?? "Unknown"}
                    <span
                      style={{
                        fontWeight: 400,
                        color: "var(--color-text-tertiary)",
                        marginLeft: 8,
                      }}
                    >
                      {c.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{c.body}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ResourceList({
  label,
  items,
}: {
  label: string;
  items: { title: string; url: string }[];
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {items.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", color: "var(--color-sky-400)", marginBottom: 4 }}
        >
          {item.title}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/hr/tasks/[id]/page.tsx"
git commit -m "feat(pages): HR task detail page (manager view) with resources and comments"
```

---

## Task 15: VA — My Tasks page

**Files:**
- Create: `src/app/(app)/va/tasks/page.tsx`

- [ ] **Step 1: Create src/app/(app)/va/tasks/page.tsx**

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { getMyTasks } from "@/lib/reads/tasks";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function VaTasksPage() {
  const user = await getCurrentUser();
  const tasks = await getMyTasks(user.id);

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const overdue = tasks.filter(
    (t) => t.status !== "Done" && t.dueDate && t.dueDate < now,
  );
  const thisWeek = tasks.filter(
    (t) => t.status !== "Done" && t.dueDate && t.dueDate >= now && t.dueDate <= sevenDays,
  );
  const open = tasks.filter((t) => t.status !== "Done");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">My Console</div>
          <h1>My Tasks</h1>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="My open tasks" value={open.length} />
        <Stat label="Overdue" value={overdue.length} trend={overdue.length ? "down" : "neutral"} />
        <Stat label="Due this week" value={thisWeek.length} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
        {overdue.length > 0 && (
          <Section title="🔴 Overdue" tasks={overdue} />
        )}
        {thisWeek.length > 0 && (
          <Section title="📅 Due This Week" tasks={thisWeek} />
        )}
        {tasks.filter(
          (t) =>
            t.status !== "Done" &&
            (!t.dueDate || t.dueDate > sevenDays),
        ).length > 0 && (
          <Section
            title="Later"
            tasks={tasks.filter(
              (t) => t.status !== "Done" && (!t.dueDate || t.dueDate > sevenDays),
            )}
          />
        )}
        {tasks.filter((t) => t.status === "Done").length > 0 && (
          <Section
            title="Done"
            tasks={tasks.filter((t) => t.status === "Done")}
          />
        )}
        {tasks.length === 0 && (
          <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
            No tasks assigned yet.
          </p>
        )}
      </div>
    </>
  );
}

type TaskItem = Awaited<ReturnType<typeof getMyTasks>>[number];

function Section({ title, tasks }: { title: string; tasks: TaskItem[] }) {
  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.map((t) => (
          <Card key={t.id} padding={16}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <a href={`/va/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                  {t.title}
                </a>
                <div className="small" style={{ marginTop: 2, color: "var(--color-text-secondary)" }}>
                  {t.project ? `${t.project.name} · ` : ""}
                  {t.assignedBy.name ? `From ${t.assignedBy.name} · ` : ""}
                  {t.dueDate ? `Due ${t.dueDate.toLocaleDateString()}` : "No due date"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Badge variant="default">{t.strategy}</Badge>
                <Badge
                  variant={
                    t.status === "Done" ? "info" : t.status === "Blocked" ? "danger" : "default"
                  }
                >
                  {t.status}
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/va/tasks/page.tsx"
git commit -m "feat(pages): VA my-tasks page with urgency sections"
```

---

## Task 16: VA — Task detail page

**Files:**
- Create: `src/app/(app)/va/tasks/[id]/page.tsx`
- Create: `src/app/api/va/tasks/[id]/status/route.ts`
- Create: `src/app/api/va/tasks/[id]/comment/route.ts`

This task includes the API routes needed for the inline status update and comment form on the VA task detail page.

- [ ] **Step 1: Create the status update API route**

```typescript
// src/app/api/va/tasks/[id]/status/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/access";
import { updateTaskStatus } from "@/lib/actions/tasks";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const { status } = (await req.json()) as { status: string };
    const task = await updateTaskStatus(user.id, user.role, id, status as never);
    return NextResponse.json(task);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create the add-comment API route**

```typescript
// src/app/api/va/tasks/[id]/comment/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/access";
import { addTaskComment } from "@/lib/actions/comments";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const { body } = (await req.json()) as { body: string };
    const comment = await addTaskComment(user.id, user.role, id, body);
    return NextResponse.json(comment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 3: Create src/app/(app)/va/tasks/[id]/page.tsx**

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { getTaskDetail } from "@/lib/reads/tasks";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function VaTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const task = await getTaskDetail(id);

  if (!task) return <p style={{ padding: 32 }}>Task not found.</p>;

  // VAs can only view their own tasks
  const isManager = ["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD", "SENIOR_VA"].includes(user.role);
  if (!isManager && task.assignedToId !== user.id) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const sops = (task.relatedSops as { title: string; url: string }[] | null) ?? [];
  const trainings = (task.relatedTrainings as { title: string; url: string }[] | null) ?? [];
  const tools = (task.suggestedTools as { title: string; url: string; category: string }[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href="/va/tasks">My Tasks</a> / {task.title}
          </div>
          <h1>{task.title}</h1>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0 }}>Status</span>
                <StatusDropdown taskId={task.id} current={task.status} />
              </div>
              <Row label="Assigned by" value={task.assignedBy.name ?? "—"} />
              <Row label="Strategy" value={task.strategy} />
              <Row label="Priority" value={task.priority} />
              <Row label="Due date" value={task.dueDate?.toLocaleDateString() ?? "—"} />
              {task.project && <Row label="Project" value={task.project.name} />}
            </div>
          </Card>

          {task.instructions && (
            <Card padding={20}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Instructions</h3>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{task.instructions}</p>
            </Card>
          )}

          {(sops.length > 0 || trainings.length > 0 || tools.length > 0) && (
            <Card padding={20}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Resources</h3>
              {sops.length > 0 && <ResourceList label="Related SOPs" items={sops} />}
              {trainings.length > 0 && <ResourceList label="Related Trainings" items={trainings} />}
              {tools.length > 0 && <ResourceList label="Suggested Tools" items={tools} />}
            </Card>
          )}
        </div>

        {/* Comments */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Comments</h2>
          </div>
          <div>
            {task.comments.length === 0 ? (
              <p style={{ padding: 24, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                No comments yet.
              </p>
            ) : (
              task.comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px dashed var(--color-border-subtle)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                    {c.author.name ?? "Unknown"}
                    <span
                      style={{
                        fontWeight: 400,
                        color: "var(--color-text-tertiary)",
                        marginLeft: 8,
                      }}
                    >
                      {c.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{c.body}</p>
                </div>
              ))
            )}
            <CommentForm taskId={task.id} />
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ResourceList({ label, items }: { label: string; items: { title: string; url: string }[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {items.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", color: "var(--color-sky-400)", marginBottom: 4 }}
        >
          {item.title}
        </a>
      ))}
    </div>
  );
}

function StatusDropdown({ taskId, current }: { taskId: string; status?: never; current: string }) {
  const statuses = ["NotStarted", "InProgress", "Done", "Blocked"] as const;
  return (
    <form
      method="POST"
      action={`/api/va/tasks/${taskId}/status`}
      style={{ display: "inline" }}
    >
      <select
        name="status"
        defaultValue={current}
        onChange={(e) => {
          const form = e.currentTarget.closest("form") as HTMLFormElement;
          const fd = new FormData(form);
          fd.set("status", e.currentTarget.value);
          fetch(form.action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: e.currentTarget.value }),
          }).then(() => window.location.reload());
        }}
        style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--color-border)" }}
      >
        {statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}

function CommentForm({ taskId }: { taskId: string }) {
  return (
    <form
      style={{ padding: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value;
        await fetch(`/api/va/tasks/${taskId}/comment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        window.location.reload();
      }}
    >
      <textarea
        name="body"
        placeholder="Add a comment…"
        rows={3}
        required
        style={{
          width: "100%",
          padding: 8,
          borderRadius: 4,
          border: "1px solid var(--color-border)",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      <button
        type="submit"
        className="btn btn-primary"
        style={{ marginTop: 8 }}
      >
        Post
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/va/tasks/[id]/page.tsx" \
  "src/app/api/va/tasks/[id]/status/route.ts" \
  "src/app/api/va/tasks/[id]/comment/route.ts"
git commit -m "feat(pages): VA task detail page with status dropdown and comment form"
```

---

## Task 17: Delegate Task page (HR quick-create)

**Files:**
- Create: `src/app/(app)/hr/tasks/new/page.tsx`
- Create: `src/app/api/hr/tasks/route.ts`

- [ ] **Step 1: Create the task creation API route**

```typescript
// src/app/api/hr/tasks/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/access";
import { createTask } from "@/lib/actions/tasks";
import { canManageTasks, AuthorizationError } from "@/lib/auth/roles";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!canManageTasks(user.role)) throw new AuthorizationError();
    const body = await req.json();
    const task = await createTask(user.id, user.role, body);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = err instanceof AuthorizationError ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 2: Create src/app/(app)/hr/tasks/new/page.tsx**

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { readSopPicker, readTrainingPicker, readToolsPicker } from "@/lib/notion-picker";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function DelegateTaskPage() {
  const user = await getCurrentUser();
  if (!canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const [vas, projects, sops, trainings, tools] = await Promise.all([
    db.user.findMany({
      where: { active: true, role: { in: ["VA", "SENIOR_VA"] } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.project.findMany({
      where: { status: { not: "Done" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    Promise.resolve(readSopPicker()),
    Promise.resolve(readTrainingPicker()),
    Promise.resolve(readToolsPicker()),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">All Tasks</div>
          <h1>Delegate a Task</h1>
        </div>
      </div>

      <Card padding={32} style={{ maxWidth: 640 }}>
        <DelegateForm vas={vas} projects={projects} sops={sops} trainings={trainings} tools={tools} />
      </Card>
    </>
  );
}

type Va = { id: string; name: string | null; email: string };
type Project = { id: string; name: string };
type ResourceEntry = { notionPageId: string; title: string; url: string; category?: string };

function DelegateForm({
  vas,
  projects,
  sops,
  trainings,
  tools,
}: {
  vas: Va[];
  projects: Project[];
  sops: ResourceEntry[];
  trainings: ResourceEntry[];
  tools: ResourceEntry[];
}) {
  const strategies = [
    "Create", "Research", "Automate", "Communicate", "Plan",
    "Delegate", "Fix", "TechSupport", "Simplify", "Recurring",
  ];

  return (
    <form
      id="delegate-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload = {
          title: fd.get("title"),
          instructions: fd.get("instructions"),
          strategy: fd.get("strategy"),
          priority: fd.get("priority"),
          assignedToId: fd.get("assignedToId"),
          projectId: fd.get("projectId") || undefined,
          client: fd.get("client") || undefined,
          dueDate: fd.get("dueDate") || undefined,
          links: fd.get("links") || undefined,
          relatedSops: Array.from(fd.getAll("sops")).map((id) =>
            sops.find((s) => s.notionPageId === id),
          ).filter(Boolean),
          relatedTrainings: Array.from(fd.getAll("trainings")).map((id) =>
            trainings.find((t) => t.notionPageId === id),
          ).filter(Boolean),
          suggestedTools: Array.from(fd.getAll("tools")).map((id) =>
            tools.find((t) => t.notionPageId === id),
          ).filter(Boolean),
        };
        const res = await fetch("/api/hr/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const task = await res.json();
          window.location.href = `/hr/tasks/${task.id}`;
        } else {
          const { error } = await res.json();
          alert(error ?? "Failed to create task");
        }
      }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <Field label="Title *">
        <input name="title" required style={inputStyle} placeholder="Task title" />
      </Field>

      <Field label="Assign to *">
        <select name="assignedToId" required style={inputStyle}>
          <option value="">Select a VA…</option>
          {vas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name ?? v.email}
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Strategy">
          <select name="strategy" style={inputStyle} defaultValue="Create">
            {strategies.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" style={inputStyle} defaultValue="Medium">
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Due date">
          <input name="dueDate" type="date" style={inputStyle} />
        </Field>
        <Field label="Client">
          <input name="client" style={inputStyle} placeholder="Client name" />
        </Field>
      </div>

      {projects.length > 0 && (
        <Field label="Link to project">
          <select name="projectId" style={inputStyle}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Instructions">
        <textarea name="instructions" rows={5} style={{ ...inputStyle, resize: "vertical" }} />
      </Field>

      <Field label="Links">
        <input name="links" style={inputStyle} placeholder="Comma-separated URLs" />
      </Field>

      {sops.length > 0 && (
        <Field label="Related SOPs">
          <MultiSelect name="sops" items={sops} />
        </Field>
      )}

      {trainings.length > 0 && (
        <Field label="Related Trainings">
          <MultiSelect name="trainings" items={trainings} />
        </Field>
      )}

      {tools.length > 0 && (
        <Field label="Suggested Tools">
          <MultiSelect name="tools" items={tools} />
        </Field>
      )}

      <button type="submit" className="btn btn-primary">
        Assign Task + Send Email
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 4,
  border: "1px solid var(--color-border)",
  boxSizing: "border-box",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{label}</label>
      {children}
    </div>
  );
}

function MultiSelect({
  name,
  items,
}: {
  name: string;
  items: { notionPageId: string; title: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
      {items.map((item) => (
        <label key={item.notionPageId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name={name} value={item.notionPageId} />
          {item.title}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
node --test tests/*.test.ts
```

Expected: all pre-existing tests still pass, plus the 13 new tasks.test.ts tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/hr/tasks/new/page.tsx" "src/app/api/hr/tasks/route.ts"
git commit -m "feat(pages): Delegate Task form with VA picker, Notion resource pickers, email on assign"
```

---

## Final verification

- [ ] **Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Run all tests**

```bash
node --test tests/*.test.ts
```

Expected: all tests pass including the 13 new tasks.test.ts entries.

- [ ] **Build**

```bash
npm run build
```

Expected: `✓ Compiled successfully`
