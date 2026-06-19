# Client Portal Design

**Date:** 2026-06-18  
**Status:** Approved

---

## Overview

A client-facing portal at `team.pwasecondbrain.uk/client/...` where PWA clients log in via Google (same NextAuth flow as internal users), view their projects and tasks, submit new work requests, and exchange comments with the team — all isolated from the internal HR/VA console.

---

## 1. Data Model

### New enums

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

### New `Role` values

Extend the existing `Role` enum with:
- `CLIENT_ADMIN` — sees all org requests/projects, not just their own
- `CLIENT_MEMBER` — sees only items they submitted or were explicitly shared on

### New models

```prisma
model ClientOrganization {
  id                  String            @id @default(cuid())
  name                String
  slug                String            @unique
  notionId            String?
  status              ClientOrgStatus   @default(active)
  active              Boolean           @default(true)
  logoUrl             String?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  memberships         ClientMembership[]
  projects            Project[]
  tasks               Task[]
  taskRequests        ClientTaskRequest[]
}

model ClientMembership {
  id                    String             @id @default(cuid())
  userId                String
  clientOrganizationId  String
  user                  User               @relation(fields: [userId], references: [id])
  clientOrganization    ClientOrganization @relation(fields: [clientOrganizationId], references: [id])
  createdAt             DateTime           @default(now())
  @@unique([userId, clientOrganizationId])
}

model ClientTaskRequest {
  id                    String                    @id @default(cuid())
  title                 String
  description           String
  priorityPreference    Priority                  @default(MEDIUM)
  dueDatePreference     DateTime?
  fileReference         String?
  status                ClientTaskRequestStatus   @default(RECEIVED)
  submittedById         String
  clientOrganizationId  String
  assignedTaskId        String?                   @unique
  declineReason         String?
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt
  submittedBy           User                      @relation(fields: [submittedById], references: [id])
  clientOrganization    ClientOrganization        @relation(fields: [clientOrganizationId], references: [id])
  assignedTask          Task?                     @relation(fields: [assignedTaskId], references: [id])
}
```

### Updated models

- `Project`: add `clientOrganizationId String?` with FK to `ClientOrganization`. Keep existing `client String?` field temporarily.
- `Task`: add `clientOrganizationId String?` with FK to `ClientOrganization`. Keep existing `client String?` field temporarily. Add `clientTaskRequest ClientTaskRequest?` reverse relation.
- `TaskComment`: add `visibility CommentVisibility @default(INTERNAL_ONLY)`
- `ProjectComment`: add `visibility CommentVisibility @default(INTERNAL_ONLY)`
- `User`: add `clientMemberships ClientMembership[]`

### Migration strategy

After schema migration: run a one-time seed script that reads each distinct `client` string on `Project` and `Task`, looks for a matching `ClientOrganization.name`, and backfills `clientOrganizationId`. Projects/tasks with no match remain with `clientOrganizationId = null`.

---

## 2. Auth Routing

### `roles.ts`

- `ConsoleView` extended to `"HR" | "PAYROLL" | "VA" | "RECRUITMENT" | "CLIENT"`
- `viewForRole()` returns `"CLIENT"` for `CLIENT_ADMIN` and `CLIENT_MEMBER`

### `(app)/layout.tsx`

After resolving `view`, add at the top:
```ts
if (view === "CLIENT") redirect("/client");
```

### `(client)/layout.tsx`

Minimal shell — no Sidebar, AdminBar, Purii, or CommandPalette:
1. `getCurrentUser()` — redirects to `/login` if unauthenticated
2. Assert `user.role === "CLIENT_ADMIN" || user.role === "CLIENT_MEMBER"` — redirect to `/` otherwise
3. Load `ClientMembership` for `user.id` — redirect to `/client/no-access` if none found
4. Render stripped nav: org name, links to Dashboard / Projects / Requests

### `/client/no-access`

Static page: "Your account is set up but hasn't been connected to a client organization yet. Please contact your team."

### Cloudflare Access

No infra changes. Client emails are added to the existing `team.pwasecondbrain.uk` Access allow-list when onboarded (same process as internal users). The layout-level guard is the real access gate.

---

## 3. Client Portal Pages & API Routes

### Pages

| Route | Description |
|---|---|
| `/client` | Dashboard: org name, open request count, active project count, recent CLIENT_VISIBLE activity |
| `/client/projects` | List of org's projects (status, assigned VA, open task count) |
| `/client/projects/[id]` | Tasks for project — only tasks sourced from a ClientTaskRequest or with CLIENT_VISIBLE comments |
| `/client/requests` | Request intake form + table of past requests with status |
| `/client/requests/[id]` | Request detail: full request + CLIENT_VISIBLE comment thread + reply form |

### API routes (`src/app/api/client/`)

| Route | Method | Action |
|---|---|---|
| `requests/route.ts` | POST | Create `ClientTaskRequest` |
| `requests/[id]/route.ts` | GET | Fetch request + CLIENT_VISIBLE comments |
| `requests/[id]/comments/route.ts` | POST | Add CLIENT_VISIBLE comment, notify Team Lead |
| `projects/route.ts` | GET | List org's projects |
| `projects/[id]/tasks/route.ts` | GET | List visible tasks for project |

All routes: `getCurrentUser()` → assert CLIENT role → resolve `ClientMembership` → scope all queries to `clientOrganizationId` from the session (never from request body).

---

## 4. HR Console Additions

### Client Organization Management — `/hr/clients`

Accessible to HR_MANAGER and PEOPLE_OPS only.

- List all `ClientOrganization` rows: name, status, member count, active project count
- **Create org**: name, slug, optional notionId
- **Add member**: email → find/create `User` with `role: CLIENT_MEMBER` → create `ClientMembership`
- **Set CLIENT_ADMIN**: promote a member's role to `CLIENT_ADMIN`
- **Pause/churn**: flip `ClientOrgStatus`

### Request Triage Queue — `/hr/requests`

Accessible to HR_MANAGER, PEOPLE_OPS, TEAM_LEAD.

Lists `ClientTaskRequest` rows with status `RECEIVED` or `TRIAGE_NEEDED`, sorted by `createdAt` ascending.

Actions per request:
- **Convert to Task**: modal pre-filled from request → pick project + assign VA → creates `Task`, sets `assignedTaskId` + status `ASSIGNED`, posts CLIENT_VISIBLE comment: "Your request has been accepted and is now in progress."
- **Decline**: sets status `DECLINED`, required reason → posts CLIENT_VISIBLE comment with reason
- **Needs info**: sets status `TRIAGE_NEEDED`, required question → posts CLIENT_VISIBLE comment

### Notifications

- New `ClientTaskRequest` → `Notification` created for all TEAM_LEAD, PEOPLE_OPS, HR_MANAGER users
- Client posts a comment → `Notification` for the assigned Team Lead
- Surfaced via existing `NotificationBell`

### Project/Task display

On `/hr/projects/[id]`, show `ClientOrganization.name` chip when `clientOrganizationId` is set, linking to `/hr/clients/[orgSlug]`. Existing `client` string field remains displayed until backfill migration complete.

---

## 5. Comment Visibility

### Posting (internal users)

- `TaskComment` and `ProjectComment` forms gain a "Share with client" checkbox, **unchecked by default** → `INTERNAL_ONLY`
- Checked → `CLIENT_VISIBLE`
- Role gate: HR_MANAGER, PEOPLE_OPS, TEAM_LEAD can post CLIENT_VISIBLE on any comment. VA cannot. SENIOR_VA can on tasks they're assigned to.

### Reading (internal users)

All comments visible. Each comment shows a label: `Internal` (grey) or `Client visible` (blue).

### Reading (client users)

`GET /api/client/requests/[id]` queries `WHERE visibility = 'CLIENT_VISIBLE'` only. This filter is server-enforced — no code path exposes INTERNAL_ONLY comments to clients.

### System-generated CLIENT_VISIBLE comments

The three triage actions (convert, decline, needs-info) auto-post CLIENT_VISIBLE comments. These are generated by server actions with hardcoded `visibility: "CLIENT_VISIBLE"` — no UI checkbox.

---

## Out of Scope (MVP)

- File uploads (file reference is a text field only)
- Email notifications to clients (Notification rows only, no outbound email in MVP)
- Client can edit/delete their own comments
- Billing or invoicing visibility
- Multiple client org membership per user
