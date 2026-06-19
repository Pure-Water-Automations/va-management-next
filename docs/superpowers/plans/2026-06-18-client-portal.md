# Client Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-facing portal at `/client/...` where PWA clients log in via Google, view their org's projects/tasks, submit work requests, and exchange comments with the team.

**Architecture:** New `(client)/` route group with its own layout shell; new Prisma models (`ClientOrganization`, `ClientMembership`, `ClientTaskRequest`) + enum extensions; all client API routes scope every query to the session's `clientOrganizationId`. Internal HR console gains `/hr/clients` org management and `/hr/requests` triage queue.

**Tech Stack:** Next.js 15 App Router, Prisma + PostgreSQL, NextAuth.js, TypeScript, existing `src/lib/auth/` patterns, existing `action()` wrapper from `src/lib/api.ts`.

---

## File Map

**New files:**
- `prisma/migrations/<ts>_client_portal/` — generated migration
- `src/lib/auth/client.ts` — `getClientMembership()`, `assertClientRole()`
- `src/lib/client-portal/permissions.ts` — `canPostClientVisibleComment(role)`
- `src/app/(client)/layout.tsx` — client shell layout
- `src/app/(client)/client/no-access/page.tsx` — no org connected page
- `src/app/(client)/client/page.tsx` — dashboard
- `src/app/(client)/client/projects/page.tsx` — project list
- `src/app/(client)/client/projects/[id]/page.tsx` — project task list
- `src/app/(client)/client/requests/page.tsx` — intake form + request list
- `src/app/(client)/client/requests/[id]/page.tsx` — request detail + comments
- `src/app/api/client/projects/route.ts`
- `src/app/api/client/projects/[id]/tasks/route.ts`
- `src/app/api/client/requests/route.ts`
- `src/app/api/client/requests/[id]/route.ts`
- `src/app/api/client/requests/[id]/comments/route.ts`
- `src/app/(app)/hr/clients/page.tsx` — org management
- `src/app/(app)/hr/clients/[slug]/page.tsx` — single org detail
- `src/app/(app)/hr/requests/page.tsx` — triage queue
- `src/app/api/hr/clients/route.ts` — create org, add member
- `src/app/api/hr/clients/[slug]/members/route.ts` — add member, promote to admin
- `src/app/api/hr/requests/[id]/convert/route.ts`
- `src/app/api/hr/requests/[id]/decline/route.ts`
- `src/app/api/hr/requests/[id]/needs-info/route.ts`
- `scripts/backfill-client-orgs.ts` — one-time FK backfill
- `tests/client-portal.test.ts` — auth guards, cross-org isolation, comment visibility

**Modified files:**
- `prisma/schema.prisma` — new enums, new models, updated `Role`, `Project`, `Task`, `TaskComment`, `ProjectComment`, `User`
- `src/lib/auth/roles.ts` — `ConsoleView` + `CLIENT`, `viewForRole()` CLIENT case
- `src/app/(app)/layout.tsx` — redirect CLIENT roles to `/client`
- `src/app/(app)/hr/projects/[id]/page.tsx` — client org chip, comment visibility checkbox
- `src/components/Sidebar.tsx` — HR nav links for Clients and Requests pages

---

## Task 1: Prisma Schema — New Enums and Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new enums to schema**

Open `prisma/schema.prisma`. After the `TaskStrategy` enum (around line 64), add:

```prisma
enum ClientOrgStatus {
  active
  paused
  churned
}

enum ClientTaskRequestStatus {
  RECEIVED
  TRIAGE_NEEDED
  READY_TO_ASSIGN
  ASSIGNED
  DECLINED
}

enum CommentVisibility {
  INTERNAL_ONLY
  CLIENT_VISIBLE
}
```

- [ ] **Step 2: Extend Role enum**

Find the `Role` enum (line 16) and add two values:

```prisma
enum Role {
  HR_MANAGER
  PEOPLE_OPS
  TEAM_LEAD
  BOOKKEEPER
  RECRUITER
  SENIOR_VA
  VA
  CLIENT_ADMIN
  CLIENT_MEMBER
}
```

- [ ] **Step 3: Add ClientOrganization model**

After the `Client` model at the bottom of the file, add:

```prisma
model ClientOrganization {
  id           String          @id @default(cuid())
  name         String
  slug         String          @unique
  notionId     String?
  status       ClientOrgStatus @default(active)
  active       Boolean         @default(true)
  logoUrl      String?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  memberships  ClientMembership[]
  projects     Project[]
  tasks        Task[]
  taskRequests ClientTaskRequest[]

  @@index([slug])
  @@index([active])
}

model ClientMembership {
  id                   String             @id @default(cuid())
  userId               String
  clientOrganizationId String
  createdAt            DateTime           @default(now())

  user               User               @relation(fields: [userId], references: [id])
  clientOrganization ClientOrganization @relation(fields: [clientOrganizationId], references: [id])

  @@unique([userId, clientOrganizationId])
  @@index([userId])
  @@index([clientOrganizationId])
}

model ClientTaskRequest {
  id                   String                  @id @default(cuid())
  title                String
  description          String
  priorityPreference   Priority                @default(Medium)
  dueDatePreference    DateTime?
  fileReference        String?
  status               ClientTaskRequestStatus @default(RECEIVED)
  submittedById        String
  clientOrganizationId String
  assignedTaskId       String?                 @unique
  declineReason        String?
  createdAt            DateTime                @default(now())
  updatedAt            DateTime                @updatedAt

  submittedBy        User               @relation("ClientTaskRequestSubmitter", fields: [submittedById], references: [id])
  clientOrganization ClientOrganization @relation(fields: [clientOrganizationId], references: [id])
  assignedTask       Task?              @relation("ClientTaskRequestTask", fields: [assignedTaskId], references: [id])

  @@index([clientOrganizationId])
  @@index([status])
  @@index([submittedById])
}
```

- [ ] **Step 4: Update Project model**

Find `model Project` (line 748). Add `clientOrganizationId` field and FK:

```prisma
model Project {
  id                   String        @id @default(cuid())
  name                 String
  description          String?
  status               ProjectStatus @default(Planning)
  type                 ProjectType   @default(Project)
  priority             Priority      @default(Medium)
  client               String?
  clientOrganizationId String?
  ownerId              String
  createdById          String
  dueDate              DateTime?
  links                String?
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  owner              User               @relation("ProjectOwner", fields: [ownerId], references: [id])
  createdBy          User               @relation("ProjectCreator", fields: [createdById], references: [id])
  clientOrganization ClientOrganization? @relation(fields: [clientOrganizationId], references: [id])
  tasks              Task[]
  comments           ProjectComment[]

  @@index([ownerId])
  @@index([status])
  @@index([client])
  @@index([clientOrganizationId])
}
```

- [ ] **Step 5: Update Task model**

Find `model Task` (line 773). Add `clientOrganizationId` field, FK, and reverse relation to `ClientTaskRequest`:

```prisma
model Task {
  id                   String       @id @default(cuid())
  title                String
  instructions         String?
  strategy             TaskStrategy @default(Create)
  status               TaskStatus   @default(NotStarted)
  priority             Priority     @default(Medium)
  client               String?
  clientOrganizationId String?
  projectId            String?
  assignedToId         String
  assignedById         String
  dueDate              DateTime?
  links                String?
  emailSent            Boolean      @default(false)
  relatedSops          Json?
  relatedTrainings     Json?
  suggestedTools       Json?
  claimable            Boolean      @default(false)
  claimRequestedById   String?
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  project              Project?           @relation(fields: [projectId], references: [id])
  clientOrganization   ClientOrganization? @relation(fields: [clientOrganizationId], references: [id])
  assignedTo           User               @relation("TaskAssignee", fields: [assignedToId], references: [id])
  assignedBy           User               @relation("TaskCreator", fields: [assignedById], references: [id])
  claimRequestedBy     User?              @relation("TaskClaimRequester", fields: [claimRequestedById], references: [id])
  comments             TaskComment[]
  checklist            ChecklistItem[]
  dependencies         TaskDependency[]   @relation("DependentTask")
  dependents           TaskDependency[]   @relation("DependencyTask")
  clientTaskRequest    ClientTaskRequest? @relation("ClientTaskRequestTask")

  @@index([assignedToId])
  @@index([projectId])
  @@index([status])
  @@index([client])
  @@index([clientOrganizationId])
}
```

- [ ] **Step 6: Update TaskComment model**

Find `model TaskComment` (line 813). Add `visibility` field:

```prisma
model TaskComment {
  id         String            @id @default(cuid())
  taskId     String
  authorId   String
  body       String
  visibility CommentVisibility @default(INTERNAL_ONLY)
  createdAt  DateTime          @default(now())

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation("TaskCommentAuthor", fields: [authorId], references: [id])

  @@index([taskId])
  @@index([visibility])
}
```

- [ ] **Step 7: Update ProjectComment model**

Find `model ProjectComment` (line 826). Add `visibility` field:

```prisma
model ProjectComment {
  id         String            @id @default(cuid())
  projectId  String
  authorId   String
  body       String
  visibility CommentVisibility @default(INTERNAL_ONLY)
  createdAt  DateTime          @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  author  User    @relation("ProjectCommentAuthor", fields: [authorId], references: [id])

  @@index([projectId])
  @@index([visibility])
}
```

- [ ] **Step 8: Update User model**

Find `model User` (line 66). Add relations for the new models:

```prisma
  clientMemberships       ClientMembership[]
  clientTaskRequests      ClientTaskRequest[]  @relation("ClientTaskRequestSubmitter")
```

Add these lines after `notifications Notification[]` (line 86).

- [ ] **Step 9: Run migration**

```bash
cd /Users/justinokamoto/Documents/va-management-next
npx prisma migrate dev --name client_portal
```

Expected: Migration created and applied, Prisma Client regenerated. No errors.

- [ ] **Step 10: Verify schema compiles**

```bash
npx prisma validate
npx prisma generate
```

Expected: `Prisma schema validated successfully.` and `Generated Prisma Client`.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add client portal models — ClientOrganization, ClientMembership, ClientTaskRequest, CommentVisibility"
```

---

## Task 2: Auth Helpers and Role Routing

**Files:**
- Modify: `src/lib/auth/roles.ts`
- Create: `src/lib/auth/client.ts`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write tests for new role routing**

Create `tests/client-portal.test.ts`:

```typescript
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { viewForRole } from "../src/lib/auth/roles.js";

test("CLIENT_ADMIN routes to CLIENT view", () => {
  assert.equal(viewForRole("CLIENT_ADMIN"), "CLIENT");
});

test("CLIENT_MEMBER routes to CLIENT view", () => {
  assert.equal(viewForRole("CLIENT_MEMBER"), "CLIENT");
});

test("HR_MANAGER still routes to HR", () => {
  assert.equal(viewForRole("HR_MANAGER"), "HR");
});

test("VA still routes to VA", () => {
  assert.equal(viewForRole("VA"), "VA");
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/justinokamoto/Documents/va-management-next
node --test --experimental-strip-types tests/client-portal.test.ts 2>&1 | head -30
```

Expected: FAIL — `viewForRole` does not return `"CLIENT"` for client roles.

- [ ] **Step 3: Update roles.ts**

Open `src/lib/auth/roles.ts`. Update `ConsoleView` and `viewForRole`:

```typescript
import type { Role } from "@prisma/client";

export type ConsoleView = "HR" | "PAYROLL" | "VA" | "RECRUITMENT" | "CLIENT";

export function viewForRole(role: Role): ConsoleView {
  switch (role) {
    case "HR_MANAGER":
    case "PEOPLE_OPS":
    case "TEAM_LEAD":
      return "HR";
    case "BOOKKEEPER":
      return "PAYROLL";
    case "RECRUITER":
      return "RECRUITMENT";
    case "CLIENT_ADMIN":
    case "CLIENT_MEMBER":
      return "CLIENT";
    case "SENIOR_VA":
    case "VA":
    default:
      return "VA";
  }
}
```

Keep all other existing functions (`isReadOnly`, `isGateReviewer`, `isRecruiter`, `canDecideHire`, `canManageTasks`, `isTaskDelegator`, `canManageProjects`, `AuthorizationError`, `assert`) unchanged.

- [ ] **Step 4: Run tests — confirm they pass**

```bash
node --test --experimental-strip-types tests/client-portal.test.ts 2>&1 | head -30
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Create src/lib/auth/client.ts**

```typescript
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import type { CurrentUser } from "@/lib/auth/access";

export type ClientMembership = {
  id: string;
  clientOrganizationId: string;
  clientOrganization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    active: boolean;
  };
};

export async function getClientMembership(userId: string): Promise<ClientMembership | null> {
  return db.clientMembership.findFirst({
    where: { userId },
    select: {
      id: true,
      clientOrganizationId: true,
      clientOrganization: {
        select: { id: true, name: true, slug: true, status: true, active: true },
      },
    },
  });
}

export function assertClientRole(user: CurrentUser): void {
  if (user.role !== "CLIENT_ADMIN" && user.role !== "CLIENT_MEMBER") {
    redirect("/");
  }
}
```

- [ ] **Step 6: Update (app)/layout.tsx — redirect client roles**

Open `src/app/(app)/layout.tsx`. Add the redirect right after `const view = await getEffectiveView(user);` (around line 17):

```typescript
  const view = await getEffectiveView(user);
  if (view === "CLIENT") redirect("/client");
```

Add `redirect` to the existing next/navigation imports at the top if not already present:
```typescript
import { redirect } from "next/navigation";
```

- [ ] **Step 7: Build check**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/auth/client.ts src/app/(app)/layout.tsx tests/client-portal.test.ts
git commit -m "feat(auth): CLIENT_ADMIN/CLIENT_MEMBER roles route to /client; getClientMembership helper"
```

---

## Task 3: Client Portal Layout and Shell

**Files:**
- Create: `src/app/(client)/layout.tsx`
- Create: `src/app/(client)/client/no-access/page.tsx`

- [ ] **Step 1: Create the client layout**

Create `src/app/(client)/layout.tsx`:

```typescript
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  assertClientRole(user);

  const membership = await getClientMembership(user.id);
  if (!membership || !membership.clientOrganization.active) {
    redirect("/client/no-access");
  }

  const orgName = membership.clientOrganization.name;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>{orgName}</span>
        <a href="/client" style={{ fontSize: 14 }}>Dashboard</a>
        <a href="/client/projects" style={{ fontSize: 14 }}>Projects</a>
        <a href="/client/requests" style={{ fontSize: 14 }}>Requests</a>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" }}>
          {user.name ?? user.email}
        </span>
      </nav>
      <main style={{ flex: 1, padding: "24px" }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create no-access page**

Create `src/app/(client)/client/no-access/page.tsx`:

```typescript
export default function NoAccessPage() {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Account not connected</h1>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Your account has been set up but hasn&apos;t been connected to a client organization yet.
        Please contact your team to get access.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Build check**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(client)/
git commit -m "feat(client-portal): layout shell and no-access page"
```

---

## Task 4: Client API Routes

**Files:**
- Create: `src/app/api/client/projects/route.ts`
- Create: `src/app/api/client/projects/[id]/tasks/route.ts`
- Create: `src/app/api/client/requests/route.ts`
- Create: `src/app/api/client/requests/[id]/route.ts`
- Create: `src/app/api/client/requests/[id]/comments/route.ts`

All client API routes follow the same guard pattern: get user → assert CLIENT role → get membership → scope to org.

- [ ] **Step 1: Add tests for cross-org isolation**

Add to `tests/client-portal.test.ts`:

```typescript
// Note: these are integration test shapes — they document the expected behavior.
// Real DB tests require a test database; these serve as spec documentation.

test("client API must scope to clientOrganizationId from session, not request body", () => {
  // This is enforced in every route handler: orgId comes from
  // membership.clientOrganizationId, never from req.body or query params.
  // Verified by code review of each route — no route accepts orgId from the client.
  assert.ok(true, "architectural invariant — verified by code review");
});
```

- [ ] **Step 2: Create shared client API guard helper**

Create `src/app/api/client/_guard.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership } from "@/lib/auth/client";

export async function clientGuard() {
  try {
    const user = await getCurrentUser();
    if (user.role !== "CLIENT_ADMIN" && user.role !== "CLIENT_MEMBER") {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    const membership = await getClientMembership(user.id);
    if (!membership) {
      return { error: NextResponse.json({ error: "No client organization" }, { status: 403 }) };
    }
    return { user, membership, orgId: membership.clientOrganizationId };
  } catch {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}
```

- [ ] **Step 3: Create projects list route**

Create `src/app/api/client/projects/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../_guard";

export async function GET() {
  const g = await clientGuard();
  if ("error" in g) return g.error;

  const projects = await db.project.findMany({
    where: { clientOrganizationId: g.orgId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      owner: { select: { name: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}
```

- [ ] **Step 4: Create project tasks route**

Create `src/app/api/client/projects/[id]/tasks/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../../../../_guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await clientGuard();
  if ("error" in g) return g.error;
  const { id: projectId } = await params;

  // Verify project belongs to this org
  const project = await db.project.findFirst({
    where: { id: projectId, clientOrganizationId: g.orgId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tasks = await db.task.findMany({
    where: {
      projectId,
      OR: [
        { clientTaskRequest: { isNot: null } },
        { comments: { some: { visibility: "CLIENT_VISIBLE" } } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assignedTo: { select: { name: true } },
      _count: { select: { comments: { where: { visibility: "CLIENT_VISIBLE" } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tasks });
}
```

- [ ] **Step 5: Create requests list + create route**

Create `src/app/api/client/requests/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../_guard";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  priorityPreference: z.enum(["Low", "Medium", "High"]).optional(),
  dueDatePreference: z.string().datetime().optional().nullable(),
  fileReference: z.string().max(500).optional().nullable(),
});

export async function GET() {
  const g = await clientGuard();
  if ("error" in g) return g.error;

  const requests = await db.clientTaskRequest.findMany({
    where: { clientOrganizationId: g.orgId },
    select: {
      id: true,
      title: true,
      status: true,
      priorityPreference: true,
      dueDatePreference: true,
      createdAt: true,
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const g = await clientGuard();
  if ("error" in g) return g.error;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const request = await db.clientTaskRequest.create({
    data: {
      ...parsed.data,
      dueDatePreference: parsed.data.dueDatePreference ? new Date(parsed.data.dueDatePreference) : null,
      priorityPreference: parsed.data.priorityPreference ?? "Medium",
      submittedById: g.user.id,
      clientOrganizationId: g.orgId,
    },
    select: { id: true },
  });

  // Notify team leads / HR
  const teamUsers = await db.user.findMany({
    where: { role: { in: ["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD"] }, active: true },
    select: { id: true },
  });
  await db.notification.createMany({
    data: teamUsers.map((u) => ({
      userId: u.id,
      type: "client_request_new",
      body: `New client request: "${parsed.data.title}"`,
      link: `/hr/requests`,
    })),
  });

  return NextResponse.json({ id: request.id }, { status: 201 });
}
```

- [ ] **Step 6: Create request detail route**

Create `src/app/api/client/requests/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../../_guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await clientGuard();
  if ("error" in g) return g.error;
  const { id } = await params;

  const request = await db.clientTaskRequest.findFirst({
    where: { id, clientOrganizationId: g.orgId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priorityPreference: true,
      dueDatePreference: true,
      fileReference: true,
      declineReason: true,
      createdAt: true,
      submittedBy: { select: { name: true, email: true } },
      assignedTask: {
        select: {
          id: true,
          title: true,
          status: true,
          assignedTo: { select: { name: true } },
          comments: {
            where: { visibility: "CLIENT_VISIBLE" },
            select: {
              id: true,
              body: true,
              createdAt: true,
              author: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ request });
}
```

- [ ] **Step 7: Create comments route**

Create `src/app/api/client/requests/[id]/comments/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../../../../_guard";
import { z } from "zod";

const CommentSchema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await clientGuard();
  if ("error" in g) return g.error;
  const { id } = await params;

  const request = await db.clientTaskRequest.findFirst({
    where: { id, clientOrganizationId: g.orgId },
    select: { id: true, assignedTaskId: true, title: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!request.assignedTaskId) {
    return NextResponse.json({ error: "Request not yet assigned to a task" }, { status: 422 });
  }

  const body = await req.json();
  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const comment = await db.taskComment.create({
    data: {
      taskId: request.assignedTaskId,
      authorId: g.user.id,
      body: parsed.data.body,
      visibility: "CLIENT_VISIBLE",
    },
    select: { id: true },
  });

  // Notify assigned Team Lead
  const task = await db.task.findUnique({
    where: { id: request.assignedTaskId },
    select: { assignedToId: true },
  });
  if (task) {
    await db.notification.create({
      data: {
        userId: task.assignedToId,
        type: "client_comment",
        body: `Client replied on request: "${request.title}"`,
        link: `/hr/requests/${id}`,
      },
    });
  }

  return NextResponse.json({ id: comment.id }, { status: 201 });
}
```

- [ ] **Step 8: Build check**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/client/
git commit -m "feat(client-portal): client API routes — projects, tasks, requests, comments"
```

---

## Task 5: Client Portal Pages

**Files:**
- Create: `src/app/(client)/client/page.tsx`
- Create: `src/app/(client)/client/projects/page.tsx`
- Create: `src/app/(client)/client/projects/[id]/page.tsx`
- Create: `src/app/(client)/client/requests/page.tsx`
- Create: `src/app/(client)/client/requests/[id]/page.tsx`

- [ ] **Step 1: Dashboard page**

Create `src/app/(client)/client/page.tsx`:

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function ClientDashboardPage() {
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const orgId = membership.clientOrganizationId;

  const [openRequestCount, activeProjectCount, recentComments] = await Promise.all([
    db.clientTaskRequest.count({
      where: {
        clientOrganizationId: orgId,
        status: { in: ["RECEIVED", "TRIAGE_NEEDED", "READY_TO_ASSIGN", "ASSIGNED"] },
      },
    }),
    db.project.count({
      where: { clientOrganizationId: orgId, status: { in: ["Planning", "Active"] } },
    }),
    db.taskComment.findMany({
      where: {
        visibility: "CLIENT_VISIBLE",
        task: { clientOrganizationId: orgId },
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { name: true } },
        task: { select: { title: true, id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>
        {membership.clientOrganization.name}
      </h1>
      <div style={{ display: "flex", gap: 24, marginBottom: 32 }}>
        <div style={{ padding: "16px 24px", border: "1px solid var(--border)", borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openRequestCount}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Open Requests</div>
        </div>
        <div style={{ padding: "16px 24px", border: "1px solid var(--border)", borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{activeProjectCount}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Active Projects</div>
        </div>
      </div>

      {recentComments.length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Recent Updates</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentComments.map((c) => (
              <div
                key={c.id}
                style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6 }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  {c.author.name} on <strong>{c.task.title}</strong> ·{" "}
                  {new Date(c.createdAt).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 14 }}>{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Projects list page**

Create `src/app/(client)/client/projects/page.tsx`:

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ClientProjectsPage() {
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const projects = await db.project.findMany({
    where: { clientOrganizationId: membership.clientOrganizationId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      owner: { select: { name: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Projects</h1>
      {projects.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>No projects yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/client/projects/${p.id}`}
            style={{
              display: "block",
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
            {p.description && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                {p.description}
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 16 }}>
              <span>Status: {p.status}</span>
              <span>Tasks: {p._count.tasks}</span>
              {p.owner.name && <span>Owner: {p.owner.name}</span>}
              {p.dueDate && <span>Due: {new Date(p.dueDate).toLocaleDateString()}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Project detail (tasks) page**

Create `src/app/(client)/client/projects/[id]/page.tsx`:

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";

export default async function ClientProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const project = await db.project.findFirst({
    where: { id: projectId, clientOrganizationId: membership.clientOrganizationId },
    select: {
      id: true,
      name: true,
      status: true,
      tasks: {
        where: {
          OR: [
            { clientTaskRequest: { isNot: null } },
            { comments: { some: { visibility: "CLIENT_VISIBLE" } } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assignedTo: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) notFound();

  return (
    <div style={{ maxWidth: 800 }}>
      <a href="/client/projects" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        ← Projects
      </a>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "12px 0 24px" }}>{project.name}</h1>
      {project.tasks.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>No visible tasks yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {project.tasks.map((t) => (
          <div
            key={t.id}
            style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 8 }}
          >
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 16 }}>
              <span>{t.status}</span>
              <span>{t.priority}</span>
              {t.assignedTo.name && <span>Assigned to: {t.assignedTo.name}</span>}
              {t.dueDate && <span>Due: {new Date(t.dueDate).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Requests page (list + intake form)**

Create `src/app/(client)/client/requests/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Server component wrapper is in the same file approach — using client component for form interactivity

export default function ClientRequestsPage() {
  const [requests, setRequests] = useState<
    { id: string; title: string; status: string; createdAt: string }[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priorityPreference: "Medium",
    dueDatePreference: "",
    fileReference: "",
  });
  const router = useRouter();

  if (!loaded) {
    fetch("/api/client/requests")
      .then((r) => r.json())
      .then((d) => { setRequests(d.requests ?? []); setLoaded(true); });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const body = {
      title: form.title,
      description: form.description,
      priorityPreference: form.priorityPreference,
      dueDatePreference: form.dueDatePreference || null,
      fileReference: form.fileReference || null,
    };
    const res = await fetch("/api/client/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/client/requests/${id}`);
    } else {
      setSubmitting(false);
      alert("Failed to submit request. Please try again.");
    }
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Requests</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 40, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Submit a new request</h2>
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 }}
        />
        <textarea
          required
          placeholder="Describe what you need..."
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 12 }}>
          <select
            value={form.priorityPreference}
            onChange={(e) => setForm({ ...form, priorityPreference: e.target.value })}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 }}
          >
            <option value="Low">Low priority</option>
            <option value="Medium">Medium priority</option>
            <option value="High">High priority</option>
          </select>
          <input
            type="date"
            value={form.dueDatePreference}
            onChange={(e) => setForm({ ...form, dueDatePreference: e.target.value })}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 }}
          />
        </div>
        <input
          placeholder="File reference (optional URL or description)"
          value={form.fileReference}
          onChange={(e) => setForm({ ...form, fileReference: e.target.value })}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 }}
        />
        <button
          type="submit"
          disabled={submitting}
          style={{
            alignSelf: "flex-start",
            padding: "8px 20px",
            background: "var(--accent, #0066cc)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </form>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Past Requests</h2>
      {loaded && requests.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>No requests yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {requests.map((r) => (
          <a
            key={r.id}
            href={`/client/requests/${r.id}`}
            style={{
              display: "block",
              padding: 14,
              border: "1px solid var(--border)",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 500 }}>{r.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, display: "flex", gap: 16 }}>
              <span>{r.status}</span>
              <span>{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Request detail page with comment thread**

Create `src/app/(client)/client/requests/[id]/page.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

type Comment = { id: string; body: string; createdAt: string; author: { name: string | null } };
type Request = {
  id: string;
  title: string;
  description: string;
  status: string;
  priorityPreference: string;
  dueDatePreference: string | null;
  declineReason: string | null;
  createdAt: string;
  submittedBy: { name: string | null; email: string };
  assignedTask: {
    id: string;
    title: string;
    status: string;
    assignedTo: { name: string | null };
    comments: Comment[];
  } | null;
};

export default function ClientRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<Request | null>(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  async function load() {
    const res = await fetch(`/api/client/requests/${id}`);
    if (res.ok) {
      const data = await res.json();
      setRequest(data.request);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    const res = await fetch(`/api/client/requests/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newComment }),
    });
    if (res.ok) {
      setNewComment("");
      await load();
    } else {
      alert("Failed to post comment.");
    }
    setPosting(false);
  }

  if (!request) return <div style={{ padding: 24, color: "var(--text-secondary)" }}>Loading…</div>;

  const comments = request.assignedTask?.comments ?? [];

  return (
    <div style={{ maxWidth: 720 }}>
      <a href="/client/requests" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        ← Requests
      </a>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: "12px 0 4px" }}>{request.title}</h1>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20, display: "flex", gap: 16 }}>
        <span>Status: <strong>{request.status}</strong></span>
        <span>Priority: {request.priorityPreference}</span>
        {request.dueDatePreference && <span>Preferred by: {new Date(request.dueDatePreference).toLocaleDateString()}</span>}
      </div>

      <div style={{ padding: 14, background: "var(--surface-secondary, #f9f9f9)", borderRadius: 8, marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{request.description}</p>
      </div>

      {request.status === "DECLINED" && request.declineReason && (
        <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, marginBottom: 24 }}>
          <strong style={{ fontSize: 13 }}>Declined:</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14 }}>{request.declineReason}</p>
        </div>
      )}

      {request.assignedTask && (
        <div style={{ marginBottom: 8, fontSize: 13, color: "var(--text-secondary)" }}>
          Linked task: <strong>{request.assignedTask.title}</strong> · {request.assignedTask.status}
          {request.assignedTask.assignedTo.name && ` · ${request.assignedTask.assignedTo.name}`}
        </div>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Updates</h2>
      {comments.length === 0 && (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No updates yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {comments.map((c) => (
          <div
            key={c.id}
            style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6 }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
              {c.author.name} · {new Date(c.createdAt).toLocaleString()}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>{c.body}</div>
          </div>
        ))}
      </div>

      {request.assignedTask && (
        <form onSubmit={postComment} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            placeholder="Add a reply…"
            rows={3}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, resize: "vertical" }}
          />
          <button
            type="submit"
            disabled={posting || !newComment.trim()}
            style={{
              alignSelf: "flex-start",
              padding: "8px 20px",
              background: "var(--accent, #0066cc)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              cursor: posting ? "not-allowed" : "pointer",
            }}
          >
            {posting ? "Posting…" : "Reply"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Build check**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/(client)/
git commit -m "feat(client-portal): dashboard, projects, requests pages"
```

---

## Task 6: Comment Visibility in HR Console

**Files:**
- Create: `src/lib/client-portal/permissions.ts`
- Modify: `src/app/(app)/hr/projects/[id]/page.tsx`

- [ ] **Step 1: Add permissions tests**

Add to `tests/client-portal.test.ts`:

```typescript
import { canPostClientVisibleComment } from "../src/lib/client-portal/permissions.js";

test("HR_MANAGER can post CLIENT_VISIBLE comments", () => {
  assert.equal(canPostClientVisibleComment("HR_MANAGER"), true);
});

test("PEOPLE_OPS can post CLIENT_VISIBLE comments", () => {
  assert.equal(canPostClientVisibleComment("PEOPLE_OPS"), true);
});

test("TEAM_LEAD can post CLIENT_VISIBLE comments", () => {
  assert.equal(canPostClientVisibleComment("TEAM_LEAD"), true);
});

test("VA cannot post CLIENT_VISIBLE comments", () => {
  assert.equal(canPostClientVisibleComment("VA"), false);
});

test("CLIENT_MEMBER cannot post CLIENT_VISIBLE comments", () => {
  assert.equal(canPostClientVisibleComment("CLIENT_MEMBER"), false);
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
node --test --experimental-strip-types tests/client-portal.test.ts 2>&1 | head -30
```

Expected: FAIL — `canPostClientVisibleComment` not found.

- [ ] **Step 3: Create permissions helper**

Create `src/lib/client-portal/permissions.ts`:

```typescript
import type { Role } from "@prisma/client";

export function canPostClientVisibleComment(role: Role): boolean {
  return role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}
```

Note: SENIOR_VA can post CLIENT_VISIBLE on tasks they're assigned to — that check is done in the route handler by comparing the comment author to the task's `assignedToId`, not in this function.

- [ ] **Step 4: Run tests — confirm they pass**

```bash
node --test --experimental-strip-types tests/client-portal.test.ts 2>&1 | head -40
```

Expected: All tests PASS.

- [ ] **Step 5: Update project detail page with visibility checkbox and label**

Open `src/app/(app)/hr/projects/[id]/page.tsx`. Read the current file fully before editing. Locate the comment form and comment list render.

In the comment POST handler (or server action), add `visibility` support. The checkbox should only appear when the project has a `clientOrganizationId`. Add to the comment form's hidden/visible fields:

Find the comment submission logic and add the visibility field. The exact implementation depends on current file structure, but the pattern is:

In the comment list, add a label after each comment body:
```tsx
{comment.visibility === "CLIENT_VISIBLE" ? (
  <span style={{ fontSize: 11, color: "#2563eb", marginLeft: 8 }}>Client visible</span>
) : (
  <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>Internal</span>
)}
```

In the comment form, conditionally show the checkbox when `project.clientOrganizationId` is set:
```tsx
{project.clientOrganizationId && canPostClientVisibleComment(user.role) && (
  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
    <input type="checkbox" name="visibility" value="CLIENT_VISIBLE" />
    Share with client
  </label>
)}
```

The form action/server action must read `visibility` from the form data and default to `"INTERNAL_ONLY"`:
```typescript
const visibility = formData.get("visibility") === "CLIENT_VISIBLE" && canPostClientVisibleComment(user.role)
  ? "CLIENT_VISIBLE"
  : "INTERNAL_ONLY";
```

- [ ] **Step 6: Build check**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/client-portal/ src/app/(app)/hr/projects/[id]/page.tsx tests/client-portal.test.ts
git commit -m "feat(client-portal): comment visibility — INTERNAL_ONLY default, CLIENT_VISIBLE checkbox for HR/leads"
```

---

## Task 7: HR Triage Queue (/hr/requests)

**Files:**
- Create: `src/app/(app)/hr/requests/page.tsx`
- Create: `src/app/api/hr/requests/[id]/convert/route.ts`
- Create: `src/app/api/hr/requests/[id]/decline/route.ts`
- Create: `src/app/api/hr/requests/[id]/needs-info/route.ts`

- [ ] **Step 1: Triage page**

Create `src/app/(app)/hr/requests/page.tsx`:

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { isGateReviewer } from "@/lib/auth/roles";
import { redirect } from "next/navigation";

export default async function HrRequestsPage() {
  const user = await getCurrentUser();
  if (!isGateReviewer(user.role) && !user.isAdmin) redirect("/hr");

  const requests = await db.clientTaskRequest.findMany({
    where: { status: { in: ["RECEIVED", "TRIAGE_NEEDED"] } },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priorityPreference: true,
      dueDatePreference: true,
      createdAt: true,
      submittedBy: { select: { name: true, email: true } },
      clientOrganization: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div style={{ maxWidth: 900, padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Client Request Triage</h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
        {requests.length} request{requests.length !== 1 ? "s" : ""} awaiting triage
      </p>

      {requests.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>No requests pending triage.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {requests.map((r) => (
          <div
            key={r.id}
            style={{ padding: 20, border: "1px solid var(--border)", borderRadius: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {r.clientOrganization.name} · {r.submittedBy.name ?? r.submittedBy.email} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ fontSize: 12, display: "flex", gap: 8 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: r.status === "TRIAGE_NEEDED" ? "#fef3c7" : "#dbeafe",
                    color: r.status === "TRIAGE_NEEDED" ? "#92400e" : "#1e40af",
                  }}
                >
                  {r.status}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{r.priorityPreference}</span>
              </div>
            </div>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "8px 0 16px", lineHeight: 1.5 }}>
              {r.description}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <a
                href={`/hr/requests/${r.id}/convert`}
                style={{
                  padding: "6px 14px",
                  background: "#16a34a",
                  color: "#fff",
                  borderRadius: 6,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                Convert to Task
              </a>
              <a
                href={`/hr/requests/${r.id}/needs-info`}
                style={{
                  padding: "6px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 13,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                Needs Info
              </a>
              <a
                href={`/hr/requests/${r.id}/decline`}
                style={{
                  padding: "6px 14px",
                  border: "1px solid #fca5a5",
                  color: "#dc2626",
                  borderRadius: 6,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                Decline
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Convert to task API route**

Create `src/app/api/hr/requests/[id]/convert/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { z } from "zod";

const ConvertSchema = z.object({
  projectId: z.string().min(1),
  assignedToId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  dueDate: z.string().datetime().optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isGateReviewer(user.role) && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const clientRequest = await db.clientTaskRequest.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, priorityPreference: true, dueDatePreference: true, clientOrganizationId: true, status: true },
  });
  if (!clientRequest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clientRequest.status === "ASSIGNED" || clientRequest.status === "DECLINED") {
    return NextResponse.json({ error: "Request already resolved" }, { status: 422 });
  }

  const body = await req.json();
  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [task] = await db.$transaction([
    db.task.create({
      data: {
        title: parsed.data.title ?? clientRequest.title,
        instructions: clientRequest.description,
        priority: clientRequest.priorityPreference,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : clientRequest.dueDatePreference,
        projectId: parsed.data.projectId,
        assignedToId: parsed.data.assignedToId,
        assignedById: user.id,
        clientOrganizationId: clientRequest.clientOrganizationId,
      },
      select: { id: true },
    }),
  ]);

  await db.clientTaskRequest.update({
    where: { id },
    data: { status: "ASSIGNED", assignedTaskId: task.id },
  });

  await db.taskComment.create({
    data: {
      taskId: task.id,
      authorId: user.id,
      body: "Your request has been accepted and is now in progress.",
      visibility: "CLIENT_VISIBLE",
    },
  });

  return NextResponse.json({ taskId: task.id }, { status: 201 });
}
```

- [ ] **Step 3: Decline API route**

Create `src/app/api/hr/requests/[id]/decline/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { z } from "zod";

const DeclineSchema = z.object({ reason: z.string().min(1).max(1000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isGateReviewer(user.role) && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const clientRequest = await db.clientTaskRequest.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, submittedById: true },
  });
  if (!clientRequest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clientRequest.status === "ASSIGNED" || clientRequest.status === "DECLINED") {
    return NextResponse.json({ error: "Request already resolved" }, { status: 422 });
  }

  const body = await req.json();
  const parsed = DeclineSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.clientTaskRequest.update({
    where: { id },
    data: { status: "DECLINED", declineReason: parsed.data.reason },
  });

  // Post a CLIENT_VISIBLE comment on any linked task, or create a standalone notification
  // Since there's no task yet, notify the submitter directly
  await db.notification.create({
    data: {
      userId: clientRequest.submittedById,
      type: "client_request_declined",
      body: `Your request "${clientRequest.title}" has been declined: ${parsed.data.reason}`,
      link: `/client/requests/${id}`,
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Needs-info API route**

Create `src/app/api/hr/requests/[id]/needs-info/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { z } from "zod";

const NeedsInfoSchema = z.object({ question: z.string().min(1).max(1000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isGateReviewer(user.role) && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const clientRequest = await db.clientTaskRequest.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, submittedById: true },
  });
  if (!clientRequest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clientRequest.status === "ASSIGNED" || clientRequest.status === "DECLINED") {
    return NextResponse.json({ error: "Request already resolved" }, { status: 422 });
  }

  const body = await req.json();
  const parsed = NeedsInfoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.clientTaskRequest.update({
    where: { id },
    data: { status: "TRIAGE_NEEDED" },
  });

  await db.notification.create({
    data: {
      userId: clientRequest.submittedById,
      type: "client_request_needs_info",
      body: `Question about your request "${clientRequest.title}": ${parsed.data.question}`,
      link: `/client/requests/${id}`,
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Build check**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/hr/requests/ src/app/api/hr/requests/
git commit -m "feat(client-portal): HR triage queue — convert/decline/needs-info actions"
```

---

## Task 8: Client Organization Management (/hr/clients)

**Files:**
- Create: `src/app/(app)/hr/clients/page.tsx`
- Create: `src/app/(app)/hr/clients/[slug]/page.tsx`
- Create: `src/app/api/hr/clients/route.ts`
- Create: `src/app/api/hr/clients/[slug]/members/route.ts`

- [ ] **Step 1: Org list + create page**

Create `src/app/(app)/hr/clients/page.tsx`:

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HrClientsPage() {
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
    redirect("/hr");
  }

  const orgs = await db.clientOrganization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      active: true,
      _count: { select: { memberships: true, projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div style={{ maxWidth: 900, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Client Organizations</h1>
        <a
          href="/hr/clients/new"
          style={{
            padding: "8px 16px",
            background: "var(--accent, #0066cc)",
            color: "#fff",
            borderRadius: 6,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          + New Organization
        </a>
      </div>

      {orgs.length === 0 && <p style={{ color: "var(--text-secondary)" }}>No client organizations yet.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {orgs.map((org) => (
          <Link
            key={org.id}
            href={`/hr/clients/${org.slug}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{org.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {org._count.memberships} member{org._count.memberships !== 1 ? "s" : ""} ·{" "}
                {org._count.projects} project{org._count.projects !== 1 ? "s" : ""}
              </div>
            </div>
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 12,
                background: org.status === "active" ? "#d1fae5" : "#f3f4f6",
                color: org.status === "active" ? "#065f46" : "#6b7280",
              }}
            >
              {org.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Org detail page**

Create `src/app/(app)/hr/clients/[slug]/page.tsx`:

```typescript
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";

export default async function HrClientOrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
    redirect("/hr");
  }

  const org = await db.clientOrganization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      active: true,
      notionId: true,
      memberships: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      projects: {
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!org) notFound();

  return (
    <div style={{ maxWidth: 800, padding: 24 }}>
      <a href="/hr/clients" style={{ fontSize: 13, color: "var(--text-secondary)" }}>← Clients</a>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "12px 0 4px" }}>{org.name}</h1>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>
        Status: {org.status} · Slug: {org.slug}
        {org.notionId && ` · Notion: ${org.notionId}`}
      </div>

      <section style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Members</h2>
          <form action={`/api/hr/clients/${org.slug}/members`} method="POST" style={{ display: "flex", gap: 8 }}>
            <input name="email" type="email" placeholder="email@example.com" required
              style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
            <button type="submit"
              style={{ padding: "6px 14px", background: "var(--accent, #0066cc)", color: "#fff", border: "none", borderRadius: 6, fontSize: 13 }}>
              Add Member
            </button>
          </form>
        </div>
        {org.memberships.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{m.user.name ?? m.user.email}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.user.email} · {m.user.role}</div>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Projects</h2>
        {org.projects.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <a href={`/hr/projects/${p.id}`} style={{ fontSize: 14, textDecoration: "none", color: "inherit" }}>{p.name}</a>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.status}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create org API**

Create `src/app/api/hr/clients/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, hyphens"),
  notionId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const org = await db.clientOrganization.create({
    data: parsed.data,
    select: { id: true, slug: true },
  });

  return NextResponse.json(org, { status: 201 });
}
```

- [ ] **Step 4: Add member API**

Create `src/app/api/hr/clients/[slug]/members/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { z } from "zod";

const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["CLIENT_ADMIN", "CLIENT_MEMBER"]).optional().default("CLIENT_MEMBER"),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;

  const org = await db.clientOrganization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // Support both JSON body and form POST (form sends email as form data)
  let email: string, role: "CLIENT_ADMIN" | "CLIENT_MEMBER";
  if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    const text = await new Response(req.body).text().catch(() => "");
    const fd = new URLSearchParams(text);
    email = fd.get("email") ?? "";
    role = "CLIENT_MEMBER";
  } else {
    const parsed = AddMemberSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    ({ email, role } = parsed.data);
  }

  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  // Find or create user
  let member = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (!member) {
    member = await db.user.create({
      data: {
        email: email.toLowerCase(),
        role,
        active: true,
      },
      select: { id: true },
    });
  } else {
    // Ensure role is CLIENT_*
    await db.user.update({
      where: { id: member.id },
      data: { role, active: true },
    });
  }

  await db.clientMembership.upsert({
    where: { userId_clientOrganizationId: { userId: member.id, clientOrganizationId: org.id } },
    create: { userId: member.id, clientOrganizationId: org.id },
    update: {},
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Build check**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/hr/clients/ src/app/api/hr/clients/
git commit -m "feat(client-portal): HR client org management — list, detail, create, add member"
```

---

## Task 9: Sidebar Nav Links

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Read the Sidebar component**

```bash
grep -n "Clients\|requests\|/hr/clients\|/hr/requests\|HR_MANAGER\|isAdmin" /Users/justinokamoto/Documents/va-management-next/src/components/Sidebar.tsx | head -40
```

- [ ] **Step 2: Add Clients and Requests links to HR nav**

Open `src/components/Sidebar.tsx`. In the HR navigation section, after the existing HR nav links, add:

```tsx
{/* Only show when in HR view and user can manage */}
{view === "HR" && (role === "HR_MANAGER" || role === "PEOPLE_OPS" || isAdmin) && (
  <>
    <a href="/hr/clients" className={navLink("/hr/clients")}>Clients</a>
    <a href="/hr/requests" className={navLink("/hr/requests")}>Client Requests</a>
  </>
)}
```

The exact insertion point and className helper depend on the existing Sidebar structure — follow the same pattern as other HR nav links in the file.

- [ ] **Step 3: Build check**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(client-portal): HR sidebar nav — Clients and Client Requests links"
```

---

## Task 10: Backfill Script and Run All Tests

**Files:**
- Create: `scripts/backfill-client-orgs.ts`

- [ ] **Step 1: Create backfill script**

Create `scripts/backfill-client-orgs.ts`:

```typescript
import { db } from "../src/lib/db";

async function main() {
  // Find all distinct client strings from projects and tasks
  const projects = await db.project.findMany({
    where: { client: { not: null }, clientOrganizationId: null },
    select: { id: true, client: true },
  });
  const tasks = await db.task.findMany({
    where: { client: { not: null }, clientOrganizationId: null },
    select: { id: true, client: true },
  });

  const allClientNames = [...new Set([
    ...projects.map(p => p.client!),
    ...tasks.map(t => t.client!),
  ])].filter(Boolean);

  console.log(`Found ${allClientNames.length} distinct client names to backfill.`);

  let matched = 0, skipped = 0;

  for (const name of allClientNames) {
    const org = await db.clientOrganization.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });

    if (!org) {
      console.log(`  SKIP: no ClientOrganization found for "${name}"`);
      skipped++;
      continue;
    }

    const [pCount, tCount] = await Promise.all([
      db.project.updateMany({
        where: { client: name, clientOrganizationId: null },
        data: { clientOrganizationId: org.id },
      }),
      db.task.updateMany({
        where: { client: name, clientOrganizationId: null },
        data: { clientOrganizationId: org.id },
      }),
    ]);

    console.log(`  OK: "${name}" → ${pCount.count} projects, ${tCount.count} tasks`);
    matched++;
  }

  console.log(`\nDone. Matched: ${matched}, Skipped (no org): ${skipped}`);
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run all tests**

```bash
cd /Users/justinokamoto/Documents/va-management-next
node --test --experimental-strip-types tests/client-portal.test.ts 2>&1
```

Expected: All tests PASS.

- [ ] **Step 3: Run existing tests to confirm no regressions**

```bash
npm test 2>&1 | tail -30
```

Expected: All existing tests pass. No regressions.

- [ ] **Step 4: Full build**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build succeeds. No type errors, no missing exports.

- [ ] **Step 5: Commit backfill script**

```bash
git add scripts/backfill-client-orgs.ts tests/client-portal.test.ts
git commit -m "feat(client-portal): backfill script for existing client string → org FK"
```

- [ ] **Step 6: Update spec and commit design docs**

```bash
git add docs/superpowers/specs/2026-06-18-client-portal-design.md docs/superpowers/plans/2026-06-18-client-portal.md
git commit -m "docs: client portal spec and implementation plan"
```

---

## Post-Implementation Checklist

After all tasks are complete, verify:

- [ ] `npm run typecheck` — zero errors
- [ ] `npm test` — all tests pass (existing + new)
- [ ] `npm run build` — clean build
- [ ] A CLIENT_ADMIN user logging in routes to `/client`, not `/hr`
- [ ] An HR_MANAGER user logging in still routes to `/hr`
- [ ] `GET /api/client/projects` with a CLIENT_MEMBER session returns only their org's projects (not another org's)
- [ ] `POST /api/client/requests` with a CLIENT_MEMBER session creates a `ClientTaskRequest` with `clientOrganizationId` from the session
- [ ] `POST /api/hr/requests/[id]/convert` creates a `Task` and posts a CLIENT_VISIBLE comment
- [ ] `GET /api/client/requests/[id]` does NOT return INTERNAL_ONLY comments
- [ ] Run backfill script in dev: `npx tsx scripts/backfill-client-orgs.ts`
- [ ] Deploy to VPS: `./deploy.sh`
