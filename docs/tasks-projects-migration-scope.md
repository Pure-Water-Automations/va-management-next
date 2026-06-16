# Tasks & Projects → App (Pure Water OS Move #1) — Engineering Scope

> Make this app (`va-management-next`, Next.js + Postgres) the **system of record** for
> Projects + Tasks, with a **read-only projection mirrored back** to Notion + the cloud MCP
> so agents/team keep read access. This is the Pure Water OS "#1 unblocker": it turns
> Notion-as-DB-via-API into enforced relational data and unblocks task-classification,
> daily-updates, the EXEC dashboard, capacity→reassignment, and the progress recorder
> (all join to tasks). Strategy context: Notion "Pure Water OS — App vs Notion/Google:
> Migration Decisions".

## 0. Prerequisite — reconcile first (do NOT skip)

The Notion side is ambiguous today:

- **Projects:** `projects--f190d316e397` vs `pure-water-projects--f575c4e886dc` (+ possibly a Northeast projects DB).
- **Tasks:** `tasks--f1641ebddff0` vs `tasks-tracker--f2507e37da81`.

**Decision needed (Justin):** pick ONE canonical Projects DB + ONE canonical Tasks DB;
decide whether Northeast and PWA share one schema or stay separate (the `kind`
discriminator handles both). Lock the 25-field task schema (handoff spec §4.2) + status/
owner conventions **before** migrating — migrating ambiguity doubles it.

## 1. Data model (Prisma) — reuse existing conventions

New models mirror the `Va`/`Candidate` patterns (owner FKs, status enums, `ActivityLog` +
`AuditLog` on every mutation via the existing `action()` wrapper):

```prisma
enum ProjectKind   { INTERNAL CLIENT NORTHEAST }
enum ProjectStatus { ACTIVE ON_HOLD DONE ARCHIVED }
enum TaskStatus    { INBOX READY IN_PROGRESS BLOCKED SUBMITTED NEEDS_REVISION DONE }
enum TaskPriority  { LOW NORMAL HIGH URGENT }

model Project {
  id          String        @id @default(cuid())
  name        String
  kind        ProjectKind   @default(INTERNAL)
  clientName  String?       // CLIENT projects (or a Client relation later)
  ownerVaId   String?       // FK -> Va.vaId
  status      ProjectStatus @default(ACTIVE)
  driveUrl    String?       // client docs/invoices stay in Drive
  notionRefId String?       // back-link to the mirrored Notion page
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  tasks       Task[]
  @@index([kind])
  @@index([ownerVaId])
}

model Task {
  id            String       @id @default(cuid())
  title         String
  projectId     String?
  assigneeVaId  String?      // FK -> Va.vaId
  reviewerVaId  String?
  status        TaskStatus   @default(INBOX)
  priority      TaskPriority @default(NORMAL)
  dueDate       DateTime?
  category      String?      // Admin/Design/Comms/Automation/Reporting/SOP/QA
  toolsUsed     String[]
  complexity    String?
  frequency     String?
  estimatedHrs  Float?
  deskLogTaskId String?      // idempotency for DeskLog sync
  sopUrl        String?      // deep-link to the SOP (SOPs stay in Notion)
  automationPotential String?
  classTag      String?      // written by the task-classification worker
  notionRefId   String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  @@index([projectId])
  @@index([assigneeVaId])
  @@index([status])
}
```

Trim/extend against the locked 25-field schema. Add real `@relation`s to `Va`
(owner/assignee/reviewer) following the existing relation style.

## 2. App surfaces

- **Team Leader Console** — a Projects/Tasks board (by client / project / status) +
  create / confirm / assign actions, role-gated to `HR_MANAGER` / `TEAM_LEAD` via
  `resolveRole()`; every write audited.
- **VA Console** — "my tasks" list + status updates (extend the existing VA dashboard).
- **Code** — `src/actions/projects.ts` + `tasks.ts` + `src/lib/services/tasks.ts`,
  following the existing `action()` → service → page pattern.

## 3. Mirror-back (mandatory) — keep agents + team reading

Two layers, do both:

1. **Read-only MCP tool over the app mirror (durable):** add `read_projects` /
   `read_va_tasks` to the cloud MCP (`tools/chatgpt-app/server.js`), backed by the app
   mirror — same template as the QBO/DeskLog mirror tools. This is how agent + ChatGPT
   read access survives the data leaving Notion, **without** a Notion round-trip.
2. **Notion projection (interim, team-facing):** a `worker/notion-tasks-mirror.ts`
   (reuse `worker/sheet-mirror-export.ts` + the `NotionRef` model) writes a read-only
   Projects/Tasks projection back to a Notion DB so `project-gap-scan` /
   `weekly-planning` and the team's Notion habit keep working until they move to the app
   UI. One-way; never human-authored.

Track both via `SyncRun`.

## 4. Data migration (one-time)

An `npm run import:tasks` script (mirroring the existing `import:sheet`) reads the
canonical Notion Projects/Tasks DB → Postgres, mapping the 25 fields and storing each
Notion page id in `notionRefId` for idempotent re-runs + the mirror back-link.

## 5. Phases

1. **Reconcile + lock schema** (Justin decision).
2. **Prisma models + migration + `import:tasks`** (parity, read-only first).
3. **Mirror-back** — the MCP read tool + the Notion projection worker (BEFORE flipping authoring).
4. **Team Leader Console board UI + actions; VA Console "my tasks."**
5. **Flip authoring to the app;** the Notion DB becomes the read-only mirror.
6. **Unblock the dependents:** task-classification worker, daily-updates form.

## 6. Risks

- **Live daily human authoring** — must match Notion's authoring ergonomics **and** keep
  the mirror, or break `project-gap-scan`, `weekly-planning`, and team habit.
- **Reconcile ambiguity first** (the duplicate DBs) — the one human decision that gates everything.
- **Agent read access** — fully mitigated by doing the mirror-back (phase 3) **before**
  flipping authoring (phase 5).
