# Projects & Task Management — Design Spec
**Date:** 2026-06-16
**Status:** Approved for implementation

---

## Overview

Build project and task management into the VA Management Console so Team Leads and Senior VAs can delegate work to VAs inside the app, replacing Aira's Google Sheet tracker and Justin's Notion workflow. VAs receive tasks, update status, and communicate via comments — all in one place.

---

## 1. Data Model

### Project

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| name | String | |
| description | String? | |
| status | ProjectStatus | Planning, Active, Done, Paused |
| type | ProjectType | Project, Event, Recurring, Report |
| priority | Priority | Low, Medium, High |
| client | String? | Free-text client name for filtering/sorting |
| ownerId | String | FK → User (VA or Team Lead) |
| createdById | String | FK → User |
| dueDate | DateTime? | |
| links | String? | comma-separated URLs |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Relations: `tasks Task[]`, `comments ProjectComment[]`

### Task

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| title | String | |
| instructions | String? | rich text / markdown |
| strategy | TaskStrategy | Create, Research, Automate, Communicate, Plan, Delegate, Fix, TechSupport, Simplify, Recurring |
| status | TaskStatus | NotStarted, InProgress, Done, Blocked |
| priority | Priority | Low, Medium, High |
| client | String? | Inherited from project if set; overridable on standalone tasks |
| projectId | String? | FK → Project (optional) |
| assignedToId | String | FK → User (VA) |
| assignedById | String | FK → User |
| dueDate | DateTime? | |
| links | String? | |
| emailSent | Boolean | default false |
| relatedSops | Json? | Cached array of `{notionPageId, title, url}` from Notion SOP library |
| relatedTrainings | Json? | Cached array of `{notionPageId, title, url}` from Notion training pages |
| suggestedTools | Json? | Cached array of `{notionPageId, title, url, category}` from Notion Tools DB |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Relations: `comments TaskComment[]`

### TaskComment

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| taskId | String | FK → Task |
| authorId | String | FK → User |
| body | String | |
| createdAt | DateTime | |

### ProjectComment

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| projectId | String | FK → Project |
| authorId | String | FK → User |
| body | String | |
| createdAt | DateTime | |

---

## 2. Permissions

### HR_MANAGER / TEAM_LEAD
- Create, edit, delete projects
- Create tasks and assign to any VA
- View all projects and tasks
- Update any task's status
- Comment on any task or project
- See project activity feed
- Trigger email notifications on assign

### SENIOR_VA
- Cannot create projects (read project context only)
- Create tasks and assign to any VA
- View all tasks (team-wide)
- Update any task's status
- Comment on any task or project
- Trigger email notifications on assign

### VA / SENIOR_VA (own tasks)
- Cannot create or assign tasks
- View own assigned tasks only
- Update own task status (NotStarted → InProgress → Done → Blocked)
- Add comments to own tasks
- See project name/description for context (read-only)
- Receive email notification on assignment

---

## 3. Navigation

### HR/Team Lead sidebar tab: "Projects"
Sub-tabs:
- **Projects** — list of all projects with task counts and progress bars
- **All Tasks** — flat list of all tasks, filterable by VA / status / due date / client
- **Delegate** — quick-create task form with VA assignment

### VA sidebar: "My Tasks"
Sub-tabs:
- **My Tasks** — personal queue sorted by urgency (overdue → due this week → later)
- **By Project** — grouped by parent project

---

## 4. Console Layout

### Team Lead / Senior VA view — Projects tab
- Stats row: Active Projects · Open Tasks · Overdue · VAs Active
- Project cards: name, status pill, owner, due date, type
  - Expanded: task list with assignee chips
  - "Add Task & Assign" button opens inline delegation form
- Delegation form shows: VA name, current task count, capacity signal → Assign button → email fires automatically

### VA view — My Tasks tab
- Stats row: My Open · Overdue · Due This Week
- Sections: 🔴 Overdue → 📅 Due This Week → Later
- Task cards: title, project name, assigned-by, strategy tag, due tag, status dropdown
- Clicking a task opens a detail drawer with full instructions + comment thread

---

## 5. Task Delegation Workflow

1. **Team Lead creates task** — fills title, instructions, strategy, priority, due date, assigns to a VA, optionally links to a project
2. **System saves + notifies** — task written to DB, email sent best-effort via Gmail API (existing OAuth sender; send failure is logged but non-fatal — task is always saved regardless)
3. **VA receives email** — subject: "📋 New task assigned: [title]", body includes strategy, due date, priority, instructions excerpt, and a deep link into the console
4. **VA works on task** — updates status via dropdown on their My Tasks view; adds comments to ask questions or post updates
5. **Team Lead monitors** — project progress % auto-calculates from task completion; activity feed shows all status changes and comments in real time

---

## 6. Comments & Activity

### Task comments
- Threaded, chronological
- Any user assigned to or who assigned the task can comment
- Shown in task detail drawer for both Team Lead and VA

### Project activity feed
- Visible to Team Lead / Senior VA on the project detail view
- Aggregates: task status changes, new assignments, task comments (excerpted), project-level notes
- Team Lead can post a project-level note (not tied to a specific task)

---

## 7. Email Notification

Uses the existing Gmail API OAuth sender (`src/lib/email.ts` + `email-oauth.ts`).

**Template: Task Assigned**
- From: configured system sender
- To: VA's email address (from User record)
- Subject: `📋 New task assigned: [title]`
- Body:
  - Assigned by, due date, priority, strategy
  - Instructions (full text)
  - Links (if any)
  - Deep link: `https://team.pwasecondbrain.uk/va/tasks/[id]`

No email on status changes or comments (keep noise low in v1).

---

## 8. Notion-Linked Resource Fields

Tasks have three optional resource fields that link to Notion content. All three are stored as cached JSON arrays on the Task row — populated at create/edit time from the local Notion mirror — so the console never needs to call the Notion API at read time.

### Related SOPs
- Source: Notion SOP Library DB (already mirrored at `tools/notion-mirror/notion_raw/sop-library--*/`)
- UX: searchable picker when creating/editing a task; shows SOP title + link
- Stored as: `[{notionPageId, title, url}]`
- Displayed as: clickable links in the task detail drawer

### Related Trainings
- Source: Notion Training pages (mirrored; training DB already exists in the app via `TrainingSession` model)
- UX: same searchable picker; shows training title + link
- Stored as: `[{notionPageId, title, url}]`
- Displayed as: clickable links in the task detail drawer

### Suggested Tools
- Source: **New Notion "Tools" DB** (to be created — Justin to add tools like Canva, ChatGPT, Claude Code, etc.)
- Schema for the Notion Tools DB: Name, Category (AI / Design / Communication / Productivity / Dev), URL/link, Description (optional)
- Once mirrored locally, the picker searches it the same way as SOPs/Trainings
- Stored as: `[{notionPageId, title, url, category}]`
- Displayed as: chips with category color in the task detail drawer
- **v1 fallback**: if the Notion Tools DB doesn't exist yet at implementation time, seed a static list of ~15 common tools in the app config; swap to the Notion mirror once the DB is created

---

## 9. New Routes

| Route | Role | Purpose |
|---|---|---|
| `/hr/projects` | HR/TL/Senior VA | Project list + delegation |
| `/hr/projects/[id]` | HR/TL/Senior VA | Project detail + activity feed |
| `/hr/tasks` | HR/TL/Senior VA | All-tasks flat view |
| `/va/tasks` | VA | My Tasks queue |
| `/va/tasks/[id]` | VA | Task detail + comments |
| `/hr/tasks/[id]` | HR/TL/Senior VA | Task detail + comments (manager view) |

---

## 9. New Server Actions

- `createProject(data)` — HR/TL only
- `updateProject(id, data)` — HR/TL only
- `createTask(data)` — HR/TL/Senior VA; triggers email
- `updateTaskStatus(id, status)` — task assignee or HR/TL
- `updateTask(id, data)` — HR/TL/Senior VA
- `addTaskComment(taskId, body)` — task participants
- `addProjectComment(projectId, body)` — HR/TL/Senior VA

---

## 10. New Prisma Models Summary

```
Project          — 4 enums: ProjectStatus, ProjectType, Priority (shared with Task)
Task             — enum TaskStrategy (10 values from Aira's sheet)
TaskComment
ProjectComment
```

Enum `Priority` is shared (Low / Medium / High). `TaskStatus` enum: NotStarted, InProgress, Done, Blocked.

---

## 11. Out of Scope (v1)

- Sub-tasks (Notion has these; deferred)
- Task dependencies / blocking relationships
- Recurring task auto-generation
- @mention notifications in comments
- File/attachment uploads on tasks
- Mobile push notifications
- Import from Aira's Google Sheet (manual transition)
