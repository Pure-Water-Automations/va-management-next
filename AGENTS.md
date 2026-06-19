# VA Management Console (cloud web app) — Agent Guide

The **cloud replacement** for the Google Apps Script (GAS) VA Management System.
A Next.js + PostgreSQL web app where **Postgres is the source of truth**; the
Google Sheet is kept only as a **read-only mirror** of the DB for easy human
inspection. Live at **https://team.pwasecondbrain.uk** behind Cloudflare Access.

> Migrated off GAS June 2026. The original GAS project (`Documents/GAS projects/
> VA MAanager`, deployment `@64`) and the Express `va-console` proxy are left
> **running as the rollback** until this app is proven in real use. Final cutover
> = disable the GAS triggers + retire `va-console`.

## Why it exists

The GAS consoles were slow (HtmlService cold starts, `google.script.run`, ~4s
`SpreadsheetApp` reads) and the recruitment layer was buggy (undefined functions,
broken routing, wrong-tab writes — see `../REVIEW-riza-testing.md`). This app is
the proven Event Planner Console pattern (Next 15 + Prisma + Postgres + CF Access
+ scoped `@googleapis/*`), restyled with the **PWA design system**.

## Where it lives

| | Path |
|---|---|
| Local source (canonical) | `Documents/GAS projects/VA MAanager/va-management-next` |
| Git | repo `okamotomiak/gas-projects`, branch `va-management-cloud` |
| VPS deploy | `/app/SecondBrain/va-management-console/current` |
| VPS env + secrets | `/app/SecondBrain/va-management-console/shared/.env.production`, `shared/secrets/service-account.json` |
| systemd web | `va-management-web.service` (port **8796**, loopback) |
| systemd timers | `va-management-daily.timer` (09:00 UTC, ordered automations) · `va-management-mirror.timer` (30 min) |
| Postgres | DB/role `va_console` on the VPS (loopback `127.0.0.1:5432`) |
| Source workbook (import + parity) | Sheet `1_a0V3skXADkSgK2Lqf5yFdDVzshhPkGzYQSwU-CKxKM` (read-only) |
| Mirror sheet (Postgres → Sheet) | Sheet `1--Y_Ef7twh38rNAn3ddST7sxk4fOJOwm_cVY6x9fhaA` |
| Service account | `streamlitjustin@symmetric-aura-453301-b8.iam.gserviceaccount.com` (shared on both sheets) |

## Architecture

```
Browser ─https─> Cloudflare Access (Google login) ─> Tunnel ─> next start (127.0.0.1:8796)
                                                                  │
   reads/writes ─> PostgreSQL (va_console) via Prisma   ← SOURCE OF TRUTH
   automations ──> systemd timers running tsx workers
   integrations ─> DeskLog REST, Notion (one-way), BunnyDoc (dormant),
                   Workspace Gmail send, Sheets (read import + write mirror)
```

- **Auth:** CF Access sets `Cf-Access-Authenticated-User-Email`; `src/lib/auth/
  access.ts` maps it to a DB `User` row carrying a `role`. A user must be BOTH in
  the Access allow policy AND have a `User` row. Dev (`npm run dev`) falls back to
  `DEV_AUTH_EMAIL`. Roles: HR_MANAGER, PEOPLE_OPS, TEAM_LEAD, BOOKKEEPER,
  RECRUITER, SENIOR_VA, VA (`src/lib/auth/roles.ts`).
- **Write actions:** `src/lib/actions/*` + `src/app/api/*/route.ts` via the
  `action()` wrapper (`src/lib/api.ts`) — identity + role guard + audit. Every
  mutation writes `ActivityLog`; the wrapper writes `AuditLog`.
- **Allowed users today:** `okamotomiak@gmail.com`, `j.okamoto@hji.edu` (both
  Admin/HR_MANAGER). To add someone: add their email to the Access policy (re-run
  `tools/cloudflare-tunnel/expose.js team 8796 <emails...>`) AND seed a `User` row.

## Data model

`prisma/schema.prisma` maps the 16 legacy sheet tabs to relational tables (Va,
CompensationRole, DeskLogHours/Efficiency [append logs — multiple rows per
va/day], PayrollPeriod/Calculation, TierReview, CapacityFlagEvent, Candidate,
TrainingSession, TrainingAssignment, Onboarding, Setting, Policy, NotionRef,
ActivityLog) + User/SyncRun/AuditLog. Business logic in `src/lib/services/*`
(payroll-calc, tier-eligibility, capacity, desklog-review) — 22 unit tests.

## Commands

```bash
# Local dev (auto-signed-in as DEV_AUTH_EMAIL)
npm install && npm run dev          # http://localhost:3032
npm test                            # node test runner (22 tests)
npm run typecheck && npm run build

# Data
npm run import:sheet                # one-time/parity: source Sheet -> Postgres
npm run prisma:seed                 # seed Users + comp-role defaults
npm run worker:mirror               # Postgres -> mirror Sheet (timer runs this)
npm run worker:{tier-check,capacity,payroll-close,desklog,checkin}

# Deploy (idempotent)
./deploy.sh                         # rsync -> npm ci -> migrate deploy -> build -> restart

# VPS ops
ssh root@74.208.40.108 "systemctl status va-management-web --no-pager"
ssh root@74.208.40.108 "journalctl -u va-management-web -n 50 --no-pager"
ssh root@74.208.40.108 "systemctl start va-management-mirror"   # run mirror now
```

## Automations (systemd, on the VPS)

`va-management-daily.timer` (09:00 UTC) runs `worker/` scripts **in order**:
desklog-ingest → tier-check → capacity-monitor → payroll-close → monthly-checkin
(ingest first because the rest read hours). `va-management-mirror.timer` exports
Postgres → the mirror sheet every 30 min. Each records a `SyncRun`.

## MCP endpoint (create/manage projects & tasks from AI clients)

`POST /api/mcp` — a dependency-free MCP (JSON-RPC over Streamable HTTP) server so
Claude / ChatGPT / Cursor / etc. can drive the same project/task actions as the UI.
Built in-app (`src/lib/mcp/{protocol,tools}.ts`, route `src/app/api/mcp/route.ts`),
reusing `createProject`/`createTask`/`updateTaskStatus` + reads (so audit logs,
`ActivityLog`, and assignment emails all fire identically).

- **Public URL:** `https://team-mcp.pwasecondbrain.uk/api/mcp` — a **separate hostname**
  (tunnel ingress → same app :8796) with **NO Cloudflare Access**, because AI clients
  can't do the Google-login flow. The **bearer token is the gate** instead. Added via
  `tools/cloudflare-tunnel/expose.js team-mcp 8796` (no emails = public). The human app
  on `team.pwasecondbrain.uk` stays fully Access-gated and unaffected.
- **Auth:** `Authorization: Bearer <MCP_API_TOKEN>` (in `shared/.env.production`, root-only).
  Acts as one admin **service identity** = `MCP_ACTOR_EMAIL` (default `okamotomiak@gmail.com`).
  Missing/invalid token → 401; unset token → 503 (endpoint disabled). Rotate by changing
  the env var + `systemctl restart va-management-web`. **Never commit/print the token.**
- **Tools (6):** `list_projects`, `create_project`, `list_tasks`, `create_task` (resolves
  project + assignee by id/name/email; assigning a VA sends the normal email; defaults to
  the service user), `update_task_status`, and `list_assignees` — which annotates each
  active VA with workload (open-task count), comp role, `skillSpecs`, recent task titles,
  clients worked with, and (given a `client` arg) a `workedWithClient` flag, **ranked best-fit**
  (prior client experience, then lowest workload) so the AI can suggest the right VA.
- **Protocol** is hand-rolled + pure (`protocol.ts`, unit-tested) and verified against the
  official `@modelcontextprotocol/sdk` client (same family Claude/ChatGPT use). Stateless
  JSON responses; `GET` → 405 (no server-initiated SSE). To add a tool: extend `MCP_TOOLS`
  + `executeTool`.

## Constraints

- **Never write to the original VA workbook** — it's read-only (import + parity
  only). The mirror sheet is the only Google write target.
- Edit GAS logic only if you're maintaining the *rollback*; new work goes here.
- Scoped `@googleapis/*` packages only — never re-add the `googleapis` mega-pkg.
- Bind is `127.0.0.1`; public reachability is solely via the Cloudflare tunnel.
- DeskLog ingest needs a valid `desklog_bearer_token` in `Setting` (the imported
  value may be a stale placeholder — the worker no-ops gracefully on 401).
- Email send uses the VPS Workspace OAuth token (`GOOGLE_WORKSPACE_TOKEN_FILE`);
  the from-address is the `system_email_from` Setting (configurable).
