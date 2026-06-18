# Client Portal Production Plan

Status: production design + implementation scaffold
Owner: Pure Water Automations
Primary goal: turn the existing Projects & Tasks module into a client-facing portal for delegation, progress tracking, communication, deliverables, and VA/team coordination.

## 1. Product promise

Recommended market claim:

> Your PWA package includes a client portal for managing work with your VA team: delegate tasks, track projects, communicate, review deliverables, and see progress without setting up a separate Notion or ClickUp workspace for VA management.

Do not claim that the PWA replaces every use case for Notion or ClickUp. The credible claim is that it replaces the client-facing VA operations workspace that most small ministries, coaches, pastors, and small businesses would otherwise build in Notion, ClickUp, Trello, or Google Sheets.

## 2. Current app foundation

The existing app already has the internal engine needed for a client portal:

- Project and Task records with status, priority, due date, owner/assignee, client, links, and comments.
- Manager-facing Projects page.
- Manager-facing All Tasks page with filters, grouping, saved views, and bulk edits.
- VA-facing My Tasks page.
- Task board and task calendar views.
- Checklists, dependencies, templates, notifications, and assignment email.
- Existing role model for HR_MANAGER, PEOPLE_OPS, TEAM_LEAD, SENIOR_VA, and VA.

The missing layer is external tenancy: secure client organizations, client memberships, client-safe visibility, client-facing routes, and client-facing workflows.

## 3. Production phases

### Phase 0 - Product and security lock

Goal: prevent scope drift before coding the external portal.

Deliverables:

- Confirm the client-facing promise above.
- Confirm whether clients are organizations, individuals, or both.
- Confirm whether one client can have multiple client users.
- Confirm if clients can assign directly to VAs or if tasks always route through a Team Leader first.
- Confirm package tiers:
  - Basic: client dashboard + delegate request + project/task tracking.
  - Pro: recurring tasks + file deliverables + weekly reports.
  - Premium: white-label portal + automations + AI summaries.

Decision recommended for v1:

- Clients submit work requests.
- Team Leaders triage/assign tasks.
- Clients can see assigned VA once the task is accepted or started.
- Internal comments are hidden from clients by default.

### Phase 1 - Tenancy and permissions

Goal: make external access safe.

Build:

- ClientOrganization model.
- ClientMembership model.
- Client-facing roles: CLIENT_ADMIN and CLIENT_MEMBER.
- Client-safe relations from Project and Task to ClientOrganization.
- Visibility controls for comments, files, and task fields.
- Access helpers in `src/lib/client-portal/permissions.ts`.
- AuditLog entries for all client-visible mutations.

Acceptance criteria:

- A client user can only access their own organization.
- A Team Lead can access only assigned client organizations unless admin.
- PWA Admin can view all.
- VA can access only tasks assigned to them or explicitly shared to them.
- Internal payroll, HR, candidate, VA evaluation, and compensation data are never reachable from client routes.

### Phase 2 - Client shell and dashboard

Goal: create a client-safe UI separate from HR/VA consoles.

Routes:

- `/client` - dashboard.
- `/client/projects` - project list.
- `/client/projects/[id]` - project detail.
- `/client/tasks/new` - delegate a task/request.
- `/client/tasks/[id]` - task detail.
- `/client/files` - deliverables and shared files.
- `/client/reports` - weekly/monthly progress summaries.
- `/client/settings` - org members, notification preferences, branding later.

Dashboard sections:

- Waiting on us.
- Waiting on you.
- In progress.
- Completed this week.
- Upcoming due dates.
- Delegate a task button.
- Recent deliverables.

Acceptance criteria:

- No HR language in client UI.
- No VA payroll/capacity/evaluation data in client UI.
- Every client route uses client access helpers.
- Internal users can preview the client portal as a selected client.

### Phase 3 - Delegation intake workflow

Goal: make delegation easier than Notion/ClickUp.

Build a request form with:

- Title.
- Desired outcome.
- Project.
- Priority.
- Due date.
- Links.
- Attachments.
- Suggested VA optional.
- Approval needed? yes/no.
- Recurring? not in MVP; save for v1.5.

Flow:

1. Client submits request.
2. System creates a Task with `source = client_portal` and initial status `NotStarted` or `PendingTriage` once the status enum supports it.
3. Team Leader is notified.
4. Team Leader assigns/accepts/reframes the task.
5. VA receives normal assignment notification.
6. Client sees the request as received, then in progress after assignment.

Acceptance criteria:

- Client request never disappears even if email/notification fails.
- Team Leader has a triage queue.
- Client can see request status immediately.
- Task can be converted into an internal VA task without duplicating data.

### Phase 4 - Communication and visibility

Goal: keep client communication clean while preserving internal coordination.

Build:

- Comment visibility: CLIENT_VISIBLE or INTERNAL_ONLY.
- Comment intent: update, question, approval_request, revision_request, note.
- Client-visible activity feed.
- Internal-only activity feed for team.
- Mention support later, but not required for MVP.

Acceptance criteria:

- Client sees only CLIENT_VISIBLE comments/events.
- Internal users can mark a comment as client-visible.
- Client questions notify the Team Leader.
- VA/internal notes are hidden by default.

### Phase 5 - Deliverables and files

Goal: make the portal feel like the home for work output.

MVP:

- Link attachments on tasks/projects.
- Deliverable links with title, description, createdBy, createdAt, taskId/projectId.
- Optional Drive URL field.

V1:

- File uploads to R2 or Drive.
- File categories: source_material, draft, final_deliverable, reference.
- Client approval/revision status.

Acceptance criteria:

- Client can find final deliverables without digging through comments.
- Team can attach a deliverable to a task or project.
- Files obey the same client/org visibility rules.

### Phase 6 - Reporting and selling-point polish

Goal: make the PWA better than generic project management for VA service clients.

Reports:

- Weekly summary.
- Completed tasks.
- In-progress tasks.
- Waiting on client.
- Blocked tasks.
- Hours used, if approved for client visibility.
- Recommended next delegations.
- Automation/SOP opportunities.

Acceptance criteria:

- Client can open `/client/reports` and understand value received.
- Team Leader can generate or send a weekly report.
- Report content is client-safe and excludes internal notes.

## 4. Data model approach

Recommended production model:

- Keep the existing Project and Task tables as the work system of record.
- Add ClientOrganization and ClientMembership.
- Replace free-text `client` usage over time with `clientOrganizationId` FKs.
- Keep `client` as a legacy/display fallback during migration.
- Add visibility tables/fields rather than creating separate external task tables.

Why:

- Avoid duplicate internal/external task systems.
- Preserve existing assignment, notification, checklists, dependencies, board/calendar/list views.
- Make client portal a permissioned lens over the operational system.

## 5. Permission matrix

| Capability | Client Admin | Client Member | Team Lead | VA | PWA Admin |
|---|---:|---:|---:|---:|---:|
| View own org dashboard | yes | yes | assigned clients | assigned tasks only | all |
| Create work request | yes | yes | yes | no | yes |
| Assign VA | no in MVP | no | yes | limited by tier | yes |
| View internal comments | no | no | yes | task participant only | yes |
| Add client-visible comment | yes | yes | yes | only if allowed | yes |
| Add internal-only comment | no | no | yes | yes on own tasks | yes |
| Approve deliverable | yes | optional | no | no | yes |
| Invite client users | yes | no | optional | no | yes |
| View HR/payroll/candidate data | no | no | role-dependent | no | yes |

## 6. Engineering work packages

### EPIC A - Tenancy foundation

1. Add ClientOrganization model.
2. Add ClientMembership model.
3. Add clientOrganizationId to Project and Task.
4. Add client role handling.
5. Add access helpers and tests.
6. Add migration script from existing free-text client names.

### EPIC B - Client shell

1. Add `/client` layout and navigation.
2. Add dashboard data read model.
3. Add project list read model.
4. Add task detail read model.
5. Add empty states and onboarding copy.

### EPIC C - Delegation intake

1. Add intake validation schema.
2. Add client task request endpoint.
3. Add Team Leader triage queue.
4. Add assignment conversion flow.
5. Add notifications.

### EPIC D - Communication visibility

1. Add comment visibility enum/field.
2. Add client-safe activity feed.
3. Add internal-only default for internal actors.
4. Add client-visible update form.
5. Add tests for leakage prevention.

### EPIC E - Deliverables

1. Add deliverable/attachment model.
2. Add link attachment UI.
3. Add final deliverable section.
4. Add approval/revision workflow.
5. Add Drive/R2 upload later.

### EPIC F - Reports

1. Add report read model.
2. Add weekly report page.
3. Add one-click email summary.
4. Add AI-generated summary later.

## 7. Test strategy

Minimum tests before client launch:

- Client cannot access another client's project by ID.
- Client cannot access HR routes.
- Client cannot see internal-only comments.
- VA cannot see unrelated client tasks.
- Team Lead can see assigned clients only.
- Admin can preview all clients.
- Client task intake creates an auditable task/request.
- Assignment email failure does not roll back task creation.
- File/deliverable visibility matches task/project visibility.

## 8. Launch gates

Do not launch external client accounts until all gates pass:

- Tenancy model merged and migrated.
- Permission tests green.
- Client-safe dashboard complete.
- Client task intake complete.
- Internal comment leakage tests green.
- Team Leader triage workflow complete.
- Client route smoke test complete.
- Backup and rollback documented.
- Admin can disable a client account quickly.

## 9. Suggested MVP sprint plan

### Sprint 1

- Add schema and migration draft.
- Add permission helpers.
- Add client preview shell.
- Add dashboard skeleton.
- Add tests for access decisions.

### Sprint 2

- Add real client organizations/memberships.
- Migrate existing Client names into ClientOrganization.
- Add `/client/projects` and `/client/tasks/[id]` backed by client-safe reads.
- Add client route gating.

### Sprint 3

- Add task intake form and API.
- Add Team Leader triage queue.
- Add notifications.
- Add client-safe comments.

### Sprint 4

- Add deliverable links.
- Add reports page.
- Polish client onboarding and marketing copy.
- Security review and pilot launch.

## 10. Pilot rollout

Recommended pilot:

- 1 internal demo client first.
- 1 friendly external client second.
- 3 paying clients after two weeks of fixes.
- Keep Notion/ClickUp promise limited to VA project management until the reports and deliverables workflow is polished.

## 11. Engineering notes

Current branch includes scaffolding only. It intentionally avoids mutating the production Prisma schema until the tenancy and client role decisions are approved. The next engineering step is to convert `docs/client-portal/schema-draft.prisma` into a real Prisma migration and update the generated Prisma Client.
