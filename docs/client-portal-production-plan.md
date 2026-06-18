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

## 3. Safety corrections from critical review

These are non-negotiable before enabling external client accounts:

1. **Separate client layout.** The scaffold currently adds `/client` preview pages under the existing authenticated app shell. That is acceptable for internal preview only. The real external portal must move to a separate route group/layout such as `src/app/(client)/client/layout.tsx`, with no HR sidebar, admin bar, VA impersonation controls, internal command palette, HR tours, payroll links, recruitment links, or VA evaluation surfaces.
2. **Explicit client console view.** Before adding `CLIENT_ADMIN` and `CLIENT_MEMBER` to the live Prisma `Role` enum, update role routing so client roles resolve to a `CLIENT` view, never the VA fallback.
3. **Resource-scoped permissions only.** Permission helpers must combine organization access, resource ownership/participation, and visibility. Do not use visibility-only checks.
4. **Request-first intake.** Client submissions must create `ClientTaskRequest` rows first. They should not immediately create assigned `Task` rows or trigger VA assignment emails. Team Leaders/Admins triage and convert approved requests into tasks.
5. **Enums in first real migration.** Visibility, membership role, client org status, request status, task source, and deliverable status should be enums in the actual Prisma migration.
6. **Leakage tests before launch.** Cross-client access, internal-only comments, and VA/client boundaries must have tests before external accounts are enabled.

## 4. Production phases

### Phase 0 - Product and security lock

Goal: prevent scope drift before coding the external portal.

Deliverables:

- Confirm the client-facing promise above.
- Confirm whether clients are organizations, individuals, or both.
- Confirm whether one client can have multiple client users.
- Confirm that v1 client submissions route through Team Leader triage before VA assignment.
- Confirm package tiers:
  - Basic: client dashboard + delegate request + project/task tracking.
  - Pro: recurring tasks + file deliverables + weekly reports.
  - Premium: white-label portal + automations + AI summaries.

Decision recommended for v1:

- Clients submit work requests.
- Team Leaders triage/assign tasks.
- Clients can see assigned VA once the task is accepted or started.
- Internal comments are hidden from clients by default.
- VAs do not publish directly to clients in MVP unless Team Leader explicitly approves that permission later.

### Phase 1 - Tenancy and permissions

Goal: make external access safe.

Build:

- ClientOrganization model.
- ClientMembership model.
- Client-facing roles: CLIENT_ADMIN and CLIENT_MEMBER.
- Client-safe relations from Project and Task to ClientOrganization.
- ClientTaskRequest model for request-first intake.
- Visibility controls for comments, files, and task fields.
- Resource-scoped access helpers in `src/lib/client-portal/permissions.ts`.
- AuditLog or ClientActivityEvent entries for all client-visible mutations.

Acceptance criteria:

- A client user can only access their own organization.
- A Team Lead can access only assigned client organizations unless admin.
- PWA Admin can view all.
- VA can access only tasks assigned/shared to them.
- Internal payroll, HR, candidate, VA evaluation, and compensation data are never reachable from client routes.
- Client-visible data is always filtered by `clientOrganizationId` before visibility is evaluated.

### Phase 2 - Client shell and dashboard

Goal: create a client-safe UI separate from HR/VA consoles.

Preview routes in this PR:

- `/client` - preview dashboard.
- `/client/projects` - preview project list.
- `/client/tasks/new` - preview intake form.
- `/client/files` - preview deliverables/files page.
- `/client/reports` - preview reports page.

Production route requirement:

- Move the real portal to its own client layout before enabling external accounts.
- The client layout must use client-specific navigation only.
- Internal preview can remain available to admins/team leads, but it should not be the external shell.

Production routes:

- `/client` - dashboard.
- `/client/projects` - project list.
- `/client/projects/[id]` - project detail.
- `/client/tasks/new` - delegate a request.
- `/client/tasks/[id]` - task/request detail.
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

Goal: make delegation easier than Notion/ClickUp while preserving triage control.

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
2. System creates a `ClientTaskRequest` with status `RECEIVED`.
3. Team Leader is notified.
4. Team Leader accepts, clarifies, declines, or assigns the request.
5. Once accepted/assigned, the system creates or links a real internal `Task`.
6. VA receives normal assignment notification only after triage.
7. Client sees the request as received, then in progress after assignment.

Acceptance criteria:

- Client request never disappears even if email/notification fails.
- Team Leader has a triage queue.
- Client can see request status immediately.
- Request can be converted into an internal VA task without duplicating data.
- No assignment email fires until triage/assignment happens.

### Phase 4 - Communication and visibility

Goal: keep client communication clean while preserving internal coordination.

Build:

- Comment visibility: CLIENT_VISIBLE or INTERNAL_ONLY.
- Comment intent: update, question, approval_request, revision_request, note.
- Client-visible activity feed.
- Internal-only activity feed for team.
- Mention support later, but not required for MVP.

Acceptance criteria:

- Client sees only CLIENT_VISIBLE comments/events within their own organization.
- Internal users can mark a comment as client-visible.
- Client questions notify the Team Leader.
- VA/internal notes are hidden by default.
- VAs can add internal-only comments only on tasks/projects they can access.

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

## 5. Data model approach

Recommended production model:

- Keep the existing Project and Task tables as the work system of record.
- Add ClientOrganization and ClientMembership.
- Add ClientTaskRequest for client intake before assignment.
- Replace free-text `client` usage over time with `clientOrganizationId` FKs.
- Keep `client` as a legacy/display fallback during migration.
- Add visibility fields rather than creating separate external task tables.

Why:

- Avoid duplicate internal/external task systems.
- Preserve existing assignment, notification, checklists, dependencies, board/calendar/list views.
- Make client portal a permissioned lens over the operational system.
- Prevent client intake from bypassing Team Leader triage.

## 6. Permission matrix

| Capability | Client Admin | Client Member | Team Lead | VA | PWA Admin |
|---|---:|---:|---:|---:|---:|
| View own org dashboard | yes | yes | assigned clients | assigned tasks only | all |
| Create work request | yes | yes | yes | no | yes |
| Assign VA | no in MVP | no | yes | no in MVP | yes |
| View internal comments | no | no | yes | task participant only | yes |
| Add client-visible comment | yes | yes | yes | no in MVP | yes |
| Add internal-only comment | no | no | yes | own tasks only | yes |
| Approve deliverable | yes | optional | no | no | yes |
| Invite client users | yes | no | optional | no | yes |
| View HR/payroll/candidate data | no | no | role-dependent | no | yes |

## 7. Engineering work packages

### EPIC A - Tenancy foundation

1. Add ClientOrganization model.
2. Add ClientMembership model.
3. Add ClientTaskRequest model.
4. Add clientOrganizationId to Project and Task.
5. Add client role handling and `CLIENT` console view.
6. Add resource-scoped access helpers and tests.
7. Add migration script from existing free-text client names.

### EPIC B - Client shell

1. Add separate client route group/layout.
2. Add client-only navigation.
3. Add dashboard data read model.
4. Add project list read model.
5. Add task/request detail read model.
6. Add empty states and onboarding copy.

### EPIC C - Delegation intake

1. Add intake validation schema.
2. Add client task request endpoint.
3. Add Team Leader triage queue.
4. Add assignment conversion flow.
5. Add notifications after triage/assignment.

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

## 8. Test strategy

Minimum tests before client launch:

- Client cannot access another client's project by ID.
- Client cannot access another client's client-visible resource.
- Client cannot access HR routes.
- Client cannot see internal-only comments.
- VA cannot see unrelated client tasks.
- VA cannot publish directly to clients in MVP.
- Team Lead can see assigned clients only.
- Admin can preview all clients.
- Client task intake creates an auditable request, not an immediate assigned task.
- Assignment email failure does not roll back task creation after triage.
- File/deliverable visibility matches task/project visibility.

## 9. Launch gates

Do not launch external client accounts until all gates pass:

- Tenancy model merged and migrated.
- Permission tests green.
- Separate client layout complete.
- Client role routing complete.
- Client-safe dashboard complete.
- ClientTaskRequest intake complete.
- Internal comment leakage tests green.
- Team Leader triage workflow complete.
- Client route smoke test complete.
- Backup and rollback documented.
- Admin can disable a client account quickly.

## 10. Suggested MVP sprint plan

### Sprint 1

- Add schema and migration draft.
- Add resource-scoped permission helpers.
- Add internal-only client preview shell.
- Add dashboard skeleton.
- Add tests for access decisions.

### Sprint 2

- Add real client organizations/memberships.
- Add `CLIENT` console view and client layout.
- Migrate existing Client names into ClientOrganization.
- Add `/client/projects` and `/client/tasks/[id]` backed by client-safe reads.
- Add client route gating.

### Sprint 3

- Add ClientTaskRequest model and intake endpoint.
- Add Team Leader triage queue.
- Add request-to-task conversion flow.
- Add notifications after triage.
- Add client-safe comments.

### Sprint 4

- Add deliverable links.
- Add reports page.
- Polish client onboarding and marketing copy.
- Security review and pilot launch.

## 11. Pilot rollout

Recommended pilot:

- 1 internal demo client first.
- 1 friendly external client second.
- 3 paying clients after two weeks of fixes.
- Keep Notion/ClickUp promise limited to VA project management until the reports and deliverables workflow is polished.

## 12. Engineering notes

Current branch includes scaffolding only. It intentionally avoids mutating the production Prisma schema until the tenancy and client role decisions are approved. The preview pages are still under the internal app shell and must not be treated as the final external portal shell. The next engineering step is to convert `docs/client-portal/schema-draft.prisma` into a real Prisma migration, add a separate client layout, and update role routing before external client accounts are enabled.
