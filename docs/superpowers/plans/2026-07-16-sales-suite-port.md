# Sales Suite Port (Follow-ups + Client Accounts + Email Templates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the three sales-side screens that today exist only on the discovery test box — Follow-ups, Client Accounts, Email Templates — plus the `?deal=` deep-link and the won-deal → client-account handoff, onto the dev-team console. Marketing (`/marketing/*`) and leadership (`/lead/*`) screens are explicitly OUT of scope.

**Architecture:** This is a selective PORT, not greenfield. All code already exists and is proven on branch `feature/sales-marketing-console` (deployed at discovery.pwasecondbrain.uk). Most files copy verbatim with `git show <branch>:<path> > <path>`; four integration points need adaptation because the trunk moved on since the branch diverged (2026-07-03 merge-base): the page/API guard (must honor the `TESTER` role via `isAllAccess` — the branch predates that fix), the nav badge computation (branch queries `socialPost`, a marketing model we are not porting), `convertDealToClient` (branch creates a `MarketingTestimonial`, also not ported), and the Prisma migration (regenerated fresh — the branch's migration bundles marketing models and is timestamped before 9 migrations that already ran on trunk DBs).

**Tech Stack:** Next.js 15 App Router, Prisma/PostgreSQL, node:test via tsx (`npm test`), house headless-migration pattern (never `prisma migrate dev`).

**Working branch:** `feature/sales-suite`, cut from `integration/ceo-on-dev` (what dev-team runs). Merged back into `integration/ceo-on-dev` at the end for the dev deploy. Prod promotion is a separate later step (merge to `main`).

**Source-of-truth branch for ports:** `feature/sales-marketing-console` (referenced below as `$SRC`).

---

## Scope

**In:**
- Prisma models `SalesFollowUp`, `SalesEmailTemplate`, `ClientAccount`; `Deal.wonAt`, `Deal.upgradeOfAccountId`
- Pure libs: `src/lib/sales/packages.ts` (package ladder), `src/lib/sales/owners.ts`, `src/lib/mode.ts`, `src/lib/auth/sales-guard.ts`
- Reads: `src/lib/reads/sales-console.ts`
- API: `src/app/api/sales/console/route.ts` (7 ops: followup add/snooze/done, template save, account log/check-in/start-upgrade)
- UI: `src/components/sales/{ui,FollowUpsClient,ClientAccountsClient,TemplatesClient}.tsx`
- Pages: `/sales/followups`, `/sales/clients`, `/sales/templates`; `?deal=` deep-link on `/sales` (+ `SalesBoard` `openDealId` prop)
- `convertDealToClient`: upgrade-deal path (bump existing account, never duplicate the org) + auto-create `ClientAccount` on normal conversion; `setDealStage` stamps `wonAt`
- Sidebar nav items + follow-ups-due-today badge
- Template seeding (the 8 real email templates — content, not demo data)

**Out (do NOT build):** all `/marketing/*` pages and models (`MarketingCampaign`, `ContentItem`, `SocialPost`, `EmailSequence`, `MarketingTestimonial`, `Referrer`), all `/lead/*` pages and models (`SalesGoal`, `SalesTarget`), demo deal/account seeding (d1–d13/c1–c9), CONSOLE_MODE middleware redirects (dev-team is a full console; `mode.ts` is ported only so guard code stays identical to the discovery box), DeskLog wiring for `ClientAccount.hoursUsed` (stays manual, as on the discovery box).

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `prisma/schema.prisma` | +3 models, +2 `Deal` fields |
| Create | `prisma/migrations/<ts>_sales_suite/migration.sql` | generated headlessly |
| Create | `src/lib/sales/packages.ts` | package ladder, `nextPkgOf`, `compactMoney` (verbatim) |
| Create | `src/lib/sales/owners.ts` | sales team directory, `ownerLabel` (verbatim) |
| Create | `src/lib/mode.ts` | `isSalesConsoleMode()` (verbatim) |
| Create | `src/lib/auth/sales-guard.ts` | `requireSalesUser()` — **adapted** (isAllAccess) |
| Create | `src/lib/reads/sales-console.ts` | row loaders for the 3 screens (verbatim) |
| Create | `src/app/api/sales/console/route.ts` | op-dispatch API — **adapted** (allowUser) |
| Create | `src/components/sales/ui.tsx` | shared chips/cards/toast/postJson (verbatim) |
| Create | `src/components/sales/FollowUpsClient.tsx` | verbatim |
| Create | `src/components/sales/ClientAccountsClient.tsx` | verbatim |
| Create | `src/components/sales/TemplatesClient.tsx` | verbatim |
| Create | `src/app/(app)/sales/followups/page.tsx` | verbatim |
| Create | `src/app/(app)/sales/clients/page.tsx` | verbatim |
| Create | `src/app/(app)/sales/templates/page.tsx` | verbatim |
| Modify | `src/app/(app)/sales/page.tsx` | `?deal=` deep-link, switch to `requireSalesUser` |
| Modify | `src/components/SalesBoard.tsx:88-96` | `openDealId` prop |
| Modify | `src/lib/sales/deal.ts:62-115` | wonAt stamp, upgrade path, account upsert — **adapted** (no testimonial) |
| Modify | `src/components/Sidebar.tsx` | nav items + `navBadges` prop |
| Modify | `src/app/(app)/layout.tsx:110-175` | compute follow-ups badge — **adapted** (no socialPost) |
| Create | `scripts/data/sales-console-seed.json` | copied (only `templates` key is consumed) |
| Create | `scripts/seed-sales-templates.ts` | templates-only idempotent seeder |
| Create | `tests/sales-packages.test.ts` | ladder math |
| Create | `tests/sales-guard.test.ts` | guard-predicate truth table |

`NavItemLink` already supports `badge` on trunk — no change needed there.

---

### Task 1: Branch + Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_sales_suite/migration.sql`

- [ ] **Step 1: Cut the working branch**

```bash
git checkout integration/ceo-on-dev && git pull --ff-only
git checkout -b feature/sales-suite
```

- [ ] **Step 2: Add the two Deal columns**

In `prisma/schema.prisma`, inside `model Deal` (around line 1399, next to `clientOrgId`), add:

```prisma
  wonAt              DateTime? // stamped once when the deal first hits "won"
  upgradeOfAccountId String? // set on upgrade deals: the ClientAccount being grown
```

- [ ] **Step 3: Add the three models**

Append to `prisma/schema.prisma` (verbatim from the discovery branch schema):

```prisma
// ── Sales console (Follow-ups / Client Accounts / Email Templates) ──────

model SalesFollowUp {
  id        String    @id @default(cuid())
  due       DateTime
  title     String
  detail    String    @default("")
  kind      String    @default("email") // call | email | check-in | proposal | payment
  refType   String? // "deal" | "client"
  refId     String?
  doneAt    DateTime? // Done rows are hidden, not deleted
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([doneAt, due])
}

model SalesEmailTemplate {
  id        String   @id @default(cuid())
  cat       String // discovery | proposal | payment | checkin | upgrade | reengage | testimonial | referral
  title     String
  purpose   String   @default("")
  body      String
  sort      Int      @default(0)
  updatedAt DateTime @updatedAt
}

model ClientAccount {
  id            String   @id @default(cuid())
  org           String
  contact       String   @default("")
  email         String   @default("")
  pkg           String   @default("Custom")
  price         Float    @default(0) // effective $/month (Hourly stores month total)
  hoursUsed     Float    @default(0) // current month
  since         DateTime @default(now())
  lastTouch     DateTime @default(now())
  ownerEmail    String   @default("")
  health        String   @default("new") // good | growing | watch | new
  checkinDue    Boolean  @default(false)
  testimonial   String   @default("none") // none | torequest | requested | received | published
  upgradeDealId String? // open upgrade Deal in the pipeline
  clientOrgId   String?  @unique
  timeline      Json     @default("[]") // [{ date, type: call|email|note|checkin, note }]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

Note: the `@@index([doneAt, due])` is a safe addition over the branch version (the follow-ups list and the nav badge both filter `doneAt: null` ordered by `due`).

- [ ] **Step 4: Validate + diff-check against the branch schema**

```bash
npx prisma validate
git diff feature/sales-marketing-console -- prisma/schema.prisma | grep -E "^[-+]model (SalesFollowUp|SalesEmailTemplate|ClientAccount)"
```

Expected: `prisma validate` passes; the model-level diff shows no removals of the three models (field-level drift beyond the added index means a transcription error — fix it).

- [ ] **Step 5: Generate the migration headlessly** (house rule: never `prisma migrate dev` — it prompts and hangs)

```bash
MIG="prisma/migrations/$(date +%Y%m%d%H%M%S)_sales_suite"
mkdir -p "$MIG"
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel   prisma/schema.prisma \
  --script > "$MIG/migration.sql"
cat "$MIG/migration.sql"
```

Expected: SQL creating `SalesFollowUp`, `SalesEmailTemplate`, `ClientAccount` tables and `ALTER TABLE "Deal" ADD COLUMN "wonAt" ..., ADD COLUMN "upgradeOfAccountId" ...`. If the script also contains UNRELATED statements, the local DB has drifted from the migration history — stop and reconcile before committing (do not ship someone else's drift inside this migration).

- [ ] **Step 6: Apply + regenerate the client**

```bash
npx prisma migrate deploy && npx prisma generate
```

Expected: `1 migration applied`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sales): schema for follow-ups, client accounts, email templates"
```

---

### Task 2: Pure libs (TDD on the package ladder)

**Files:**
- Create: `src/lib/sales/packages.ts`, `src/lib/sales/owners.ts`, `src/lib/mode.ts`
- Test: `tests/sales-packages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/sales-packages.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { PACKAGES, LADDER, pkgByName, nextPkgOf, compactMoney, pkgOptionLabel } from "../src/lib/sales/packages";

test("pkgByName is case/whitespace-insensitive and null-safe", () => {
  assert.equal(pkgByName(" stream ")?.name, "Stream");
  assert.equal(pkgByName("OCEAN PLUS")?.name, "Ocean Plus");
  assert.equal(pkgByName("nope"), null);
  assert.equal(pkgByName(null), null);
  assert.equal(pkgByName(undefined), null);
});

test("upgrade ladder: Hourly → Spring, each tier steps up, top and Custom dead-end", () => {
  assert.equal(nextPkgOf("Hourly")?.name, "Spring");
  assert.equal(nextPkgOf("Spring")?.name, "Stream");
  assert.equal(nextPkgOf("Ocean")?.name, "Ocean Plus");
  assert.equal(nextPkgOf("Ocean Enterprise"), null); // top of the ladder
  assert.equal(nextPkgOf("Custom"), null); // not on the ladder
  assert.equal(nextPkgOf(null), null);
});

test("every ladder tier is a priced package", () => {
  for (const name of LADDER) {
    const p = pkgByName(name);
    assert.ok(p && p.price != null && p.hours != null, `${name} must be priced`);
  }
  assert.equal(PACKAGES.length, 8);
});

test("compactMoney: $ under 1k, k-notation at 1k+", () => {
  assert.equal(compactMoney(800), "$800");
  assert.equal(compactMoney(1400), "$1.4k");
  assert.equal(compactMoney(2000), "$2k");
  assert.equal(compactMoney(4700), "$4.7k");
});

test("pkgOptionLabel covers hourly, priced, and unpriced shapes", () => {
  assert.equal(pkgOptionLabel(pkgByName("Hourly")!), "Hourly — $10/hr");
  assert.equal(pkgOptionLabel(pkgByName("Stream")!), "Stream — $800/mo · 68 hrs");
  assert.equal(pkgOptionLabel(pkgByName("Custom")!), "Custom");
});
```

- [ ] **Step 2: Run it — must fail on the missing module**

```bash
node --import tsx --test tests/sales-packages.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/sales/packages'`.

- [ ] **Step 3: Port the three libs verbatim from the discovery branch**

```bash
git show feature/sales-marketing-console:src/lib/sales/packages.ts > src/lib/sales/packages.ts
git show feature/sales-marketing-console:src/lib/sales/owners.ts   > src/lib/sales/owners.ts
git show feature/sales-marketing-console:src/lib/mode.ts           > src/lib/mode.ts
```

(`packages.ts` = the PWA package ladder Hourly→Ocean Enterprise with `pkgByName`/`nextPkgOf`/`compactMoney`/`pkgOptionLabel`; `owners.ts` = the 4-person sales directory + `ownerLabel`; `mode.ts` = `isSalesConsoleMode()` reading `CONSOLE_MODE`.)

- [ ] **Step 4: Run the test again**

```bash
node --import tsx --test tests/sales-packages.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales/packages.ts src/lib/sales/owners.ts src/lib/mode.ts tests/sales-packages.test.ts
git commit -m "feat(sales): package ladder, owners directory, console-mode helper (ported)"
```

---

### Task 3: Guard (adapted for TESTER) + reads module

**Files:**
- Create: `src/lib/auth/sales-guard.ts`, `src/lib/reads/sales-console.ts`
- Test: `tests/sales-guard.test.ts`

**Why adapted:** the branch guard admits `isSalesRep(role) || user.isAdmin` — it predates the QA `TESTER` role. Trunk's `/sales` page was already fixed once for exactly this (`isAllAccess`, see the redirect-loop comment at `src/app/(app)/sales/page.tsx:13-16`). The port must not regress that fix, so the guard uses `isAllAccess(user)` (admin OR TESTER) instead of `user.isAdmin`. To keep the predicate testable without mocking `next/navigation`, split the decision (pure) from the redirect (wrapper).

- [ ] **Step 1: Write the failing test**

Create `tests/sales-guard.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { salesAccessFor } from "../src/lib/auth/sales-guard";

const u = (role: string, isAdmin = false) => ({ role: role as never, isAdmin });

test("client-portal logins are sent to the portal", () => {
  assert.equal(salesAccessFor(u("CLIENT_ADMIN")), "client");
});

test("sales reps and all-access users are allowed", () => {
  assert.equal(salesAccessFor(u("SALES")), "ok");
  assert.equal(salesAccessFor(u("VA", true)), "ok"); // platform admin
  assert.equal(salesAccessFor(u("TESTER")), "ok"); // QA role — the old redirect-loop regression
});

test("other staff are bounced home unless the deployment is a sales console", () => {
  assert.equal(salesAccessFor(u("VA")), "home");
  assert.equal(salesAccessFor(u("HR_MANAGER")), "home");
  process.env.CONSOLE_MODE = "sales";
  try {
    assert.equal(salesAccessFor(u("VA")), "ok"); // whole instance IS the sales console
    assert.equal(salesAccessFor(u("CLIENT_ADMIN")), "client"); // clients still stay in the portal
  } finally {
    delete process.env.CONSOLE_MODE;
  }
});
```

- [ ] **Step 2: Run it — must fail**

```bash
node --import tsx --test tests/sales-guard.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/auth/sales-guard'`.

- [ ] **Step 3: Write the guard**

Create `src/lib/auth/sales-guard.ts`:

```ts
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getCurrentUser, isAllAccess, type CurrentUser } from "@/lib/auth/access";
import { isSalesRep, viewForRole } from "@/lib/auth/roles";
import { isSalesConsoleMode } from "@/lib/mode";

// Shared guard for every Sales console page. Sales reps + all-access users
// (admins AND the QA TESTER role — guarding on isAdmin alone re-creates the
// TESTER redirect loop /sales was already fixed for once). On a sales-console
// deployment (CONSOLE_MODE="sales") every staff login is allowed in — the
// whole instance IS the sales console — while client logins stay in the portal.
export function salesAccessFor(user: { role: Role; isAdmin: boolean }): "ok" | "client" | "home" {
  if (viewForRole(user.role) === "CLIENT") return "client";
  if (isSalesRep(user.role) || isAllAccess(user) || isSalesConsoleMode()) return "ok";
  return "home";
}

export async function requireSalesUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const access = salesAccessFor(user);
  if (access === "client") redirect("/client");
  if (access === "home") redirect("/");
  return user;
}
```

- [ ] **Step 4: Run the test again**

```bash
node --import tsx --test tests/sales-guard.test.ts
```

Expected: PASS. (If the `SALES` or `CLIENT_ADMIN` role literals don't exist in the Prisma `Role` enum, check `grep '^\s*SALES\|CLIENT' prisma/schema.prisma` and use the real literals — `isSalesRep`/`viewForRole` in `src/lib/auth/roles.ts` are the source of truth.)

- [ ] **Step 5: Port the reads module verbatim**

```bash
git show feature/sales-marketing-console:src/lib/reads/sales-console.ts > src/lib/reads/sales-console.ts
```

(84 lines: `loadFollowUps` — open rows soonest-first, `loadClientAccounts` — alphabetical with timeline coercion, `loadEmailTemplates` — sort order; plus the `FollowUpRow`/`ClientAccountRow`/`EmailTemplateRow`/`TimelineEntry` types the components import.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/sales-guard.ts src/lib/reads/sales-console.ts tests/sales-guard.test.ts
git commit -m "feat(sales): requireSalesUser guard (TESTER-safe) + console read helpers"
```

---

### Task 4: The op-dispatch API route (adapted allow)

**Files:**
- Create: `src/app/api/sales/console/route.ts`

- [ ] **Step 1: Port the route verbatim, then adapt the gate**

```bash
mkdir -p src/app/api/sales/console
git show feature/sales-marketing-console:src/app/api/sales/console/route.ts > src/app/api/sales/console/route.ts
```

The file's 7 ops (`followup_add`, `followup_snooze` +7 days, `followup_done`, `template_save` body-only, `account_log` timeline + lastTouch + checkinDue clear, `account_checkin` → creates a check-in follow-up due in 3 days, `account_start_upgrade` → idempotent upgrade Deal at `proposal_needed` + proposal follow-up) port unchanged.

- [ ] **Step 2: Replace the role-only gate with the same predicate the pages use**

The branch's gate takes only a role, so it can't see `isAdmin`/TESTER. Edit the top of the file — old:

```ts
import type { Prisma, Role } from "@prisma/client";
import { action, str, optStr } from "@/lib/api";
import { db } from "@/lib/db";
import { isSalesRep, viewForRole } from "@/lib/auth/roles";
import { isSalesConsoleMode } from "@/lib/mode";
import { pkgByName, nextPkgOf } from "@/lib/sales/packages";
```

new:

```ts
import type { Prisma } from "@prisma/client";
import { action, str, optStr } from "@/lib/api";
import { db } from "@/lib/db";
import { salesAccessFor } from "@/lib/auth/sales-guard";
import { pkgByName, nextPkgOf } from "@/lib/sales/packages";
```

and old:

```ts
const allow = (role: Role) =>
  isSalesRep(role) || (isSalesConsoleMode() && viewForRole(role) !== "CLIENT");
```

new:

```ts
// Same line the pages draw: sales reps + all-access (admin/TESTER); on a
// sales-console deployment any staff login; client-portal logins never.
const allowUser = (user: { role: import("@prisma/client").Role; isAdmin: boolean }) =>
  salesAccessFor(user) === "ok";
```

and at the bottom, old: `{ allow },` → new: `{ allowUser },` (the `action()` helper in `src/lib/api.ts:17-20` accepts `allowUser: (user: CurrentUser) => boolean`).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: no errors in `src/app/api/sales/console/route.ts`. (`Deal.stage: "proposal_needed"`, `billingType: "retainer"`, `source: "client"` all exist on trunk — the discovery funnel phases are already merged.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sales/console
git commit -m "feat(sales): console op API — follow-ups, templates, accounts, upgrades"
```

---

### Task 5: Client components (verbatim) + pages

**Files:**
- Create: `src/components/sales/ui.tsx`, `FollowUpsClient.tsx`, `ClientAccountsClient.tsx`, `TemplatesClient.tsx`
- Create: `src/app/(app)/sales/followups/page.tsx`, `clients/page.tsx`, `templates/page.tsx`

- [ ] **Step 1: Port the four components verbatim**

```bash
mkdir -p src/components/sales
for f in ui FollowUpsClient ClientAccountsClient TemplatesClient; do
  git show feature/sales-marketing-console:src/components/sales/$f.tsx > src/components/sales/$f.tsx
done
```

(`ui.tsx` 227 lines — Chip/KindChip/HealthChip/GradientAvatar/ProgressBar/StatCard/StatGrid/useToast/postJson, self-contained; `FollowUpsClient` 160 — day-bucketed list, snooze/done, jump-to `/sales?deal=` or `/sales/clients?account=`; `ClientAccountsClient` 391 — account cards + drawer with timeline log, check-in scheduling, hours-vs-package bar, "Start upgrade" → routes to the new deal; `TemplatesClient` 120 — category-filtered template cards with copy + edit-body save.)

Cross-check nothing marketing leaked in: `grep -rn "marketing\|Referrer\|SocialPost" src/components/sales/` → expected: no matches.

- [ ] **Step 2: Port the three pages verbatim**

```bash
mkdir -p "src/app/(app)/sales/followups" "src/app/(app)/sales/clients" "src/app/(app)/sales/templates"
git show "feature/sales-marketing-console:src/app/(app)/sales/followups/page.tsx" > "src/app/(app)/sales/followups/page.tsx"
git show "feature/sales-marketing-console:src/app/(app)/sales/clients/page.tsx"   > "src/app/(app)/sales/clients/page.tsx"
git show "feature/sales-marketing-console:src/app/(app)/sales/templates/page.tsx" > "src/app/(app)/sales/templates/page.tsx"
```

Each page is ~25 lines: `await requireSalesUser()` → load rows → render the client component (`clients/page.tsx` also passes `?account=` through as `openAccountId`).

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -15
```

Expected: build succeeds; the route list includes `/sales/followups`, `/sales/clients`, `/sales/templates`.

- [ ] **Step 4: Commit**

```bash
git add src/components/sales "src/app/(app)/sales"
git commit -m "feat(sales): follow-ups, client accounts, email templates screens"
```

---

### Task 6: `?deal=` deep-link on the pipeline

**Files:**
- Modify: `src/components/SalesBoard.tsx:88-96`
- Modify: `src/app/(app)/sales/page.tsx`

The follow-ups list and the account drawer both navigate to `/sales?deal=<id>` — without this task those jumps land on the board with nothing opened.

- [ ] **Step 1: Add the `openDealId` prop to SalesBoard**

In `src/components/SalesBoard.tsx`, old:

```tsx
export function SalesBoard({ deals, canFinance = true, testimonials }: { deals: DealRow[]; canFinance?: boolean; testimonials?: string | null }) {
```

new:

```tsx
export function SalesBoard({ deals, canFinance = true, testimonials, openDealId = null }: { deals: DealRow[]; canFinance?: boolean; testimonials?: string | null; openDealId?: string | null }) {
```

and old:

```tsx
  const [openId, setOpenId] = useState<string | null>(null);
```

new:

```tsx
  // `openDealId` deep-links straight into a deal's drawer (/sales?deal=<id>).
  const [openId, setOpenId] = useState<string | null>(openDealId);
```

- [ ] **Step 2: Rewrite `src/app/(app)/sales/page.tsx`** to use the shared guard and pass the param (full new content — the TESTER behavior is preserved because `requireSalesUser` uses `isAllAccess`):

```tsx
import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadSalesRows } from "@/lib/reads/sales";
import { loadSettings } from "@/lib/settings";
import { SalesBoard } from "@/components/SalesBoard";

export const dynamic = "force-dynamic";

// The dedicated Sales console — the SALES role's home, also open to all-access
// users (admins + TESTER). `?deal=<id>` deep-links straight into that deal's
// drawer (follow-ups and the client-account drawer link here).
export default async function SalesConsole({ searchParams }: { searchParams: Promise<{ deal?: string }> }) {
  const user = await requireSalesUser();
  const { deal } = await searchParams;

  const rows = await loadSalesRows();
  const canFinance = user.isAdmin || user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS";
  const settings = await loadSettings();
  const testimonials = settings.get("discovery_testimonials") || null;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Sales</div>
          <h1>Sales pipeline</h1>
          <p className="small">
            The full client funnel — from a public discovery lead (auto-scored Hot / Warm / Cold) through the
            discovery call, proposal, signature, and onboarding. New leads arrive from the public
            <strong> /discover</strong> form; book and run the call here, then send the agreement and convert to a client.
          </p>
        </div>
      </div>
      <SalesBoard deals={rows} canFinance={canFinance} testimonials={testimonials} openDealId={deal ?? null} />
    </>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/SalesBoard.tsx "src/app/(app)/sales/page.tsx"
git commit -m "feat(sales): ?deal= deep-link into the pipeline drawer"
```

---

### Task 7: Won-deal → client-account handoff in `deal.ts`

**Files:**
- Modify: `src/lib/sales/deal.ts` (three edits)

**Adaptation:** the branch version also creates a `MarketingTestimonial` on conversion — that model is not ported, so that block is dropped. The `ClientAccount.testimonial = "torequest"` status string stays (it drives the drawer's testimonial chip and costs nothing).

- [ ] **Step 1: Import the ladder helper**

Old (top of `src/lib/sales/deal.ts`):

```ts
import { slugify, systemEmailFrom, teamRecipients, companyName } from "@/lib/sales/util";
```

New:

```ts
import { slugify, systemEmailFrom, teamRecipients, companyName } from "@/lib/sales/util";
import { pkgByName } from "@/lib/sales/packages";
```

- [ ] **Step 2: Stamp `wonAt` in `setDealStage`**

Old (in `setDealStage`, ~line 63):

```ts
  if (stage === "lost" && note?.trim()) data.lostReason = note.trim();
```

New:

```ts
  if (stage === "lost" && note?.trim()) data.lostReason = note.trim();
  // Stamp the win once, so "won this month" reporting can be computed later.
  if (stage === "won") data.wonAt = new Date();
```

- [ ] **Step 3: Upgrade-deal path in `convertDealToClient`** — insert directly AFTER the signed-and-paid guard (`throw new Error("Cannot convert: the agreement must be signed and paid first.")` block) and BEFORE the "Pick a unique slug." comment:

```ts
  // UPGRADE deals grow an EXISTING client to the next package tier — never
  // create a second org/account for them. Bump the linked account instead and
  // hand back its org (if the account has one).
  if (deal.upgradeOfAccountId) {
    const account = await db.clientAccount.findUnique({ where: { id: deal.upgradeOfAccountId } });
    if (account) {
      const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const timeline = Array.isArray(account.timeline) ? account.timeline : [];
      await db.clientAccount.update({
        where: { id: account.id },
        data: {
          pkg: deal.packageName ?? account.pkg,
          price: deal.dealValue ?? pkgByName(deal.packageName)?.price ?? account.price,
          upgradeDealId: null,
          lastTouch: new Date(),
          timeline: [
            { date: dateLabel, type: "note", note: `Upgraded to ${deal.packageName ?? "a new package"} — signed and paid.` },
            ...(timeline as Prisma.JsonArray),
          ] as Prisma.InputJsonValue,
        },
      });
      await db.deal.update({ where: { id: dealId }, data: { stage: "won", wonAt: new Date() } });
      await logActivity({
        source: "sales",
        eventType: "deal_won_client_created",
        severity: "success",
        summary: `${deal.orgName} upgrade won → ${account.org} moved to ${deal.packageName ?? "new package"}`,
      });
      return account.clientOrgId
        ? await db.clientOrganization.findUnique({ where: { id: account.clientOrgId } })
        : null;
    }
    // Dangling account reference — fall through to the normal conversion.
  }
```

- [ ] **Step 4: `wonAt` + account upsert on the normal conversion path**

Old:

```ts
  await db.deal.update({ where: { id: dealId }, data: { clientOrgId: org.id, stage: "won" } });
```

New:

```ts
  await db.deal.update({ where: { id: dealId }, data: { clientOrgId: org.id, stage: "won", wonAt: new Date() } });

  // Sales console handoff (best-effort): the win lands as a client account on
  // the Client Accounts screen, flagged "to request" for a testimonial.
  try {
    const pkg = pkgByName(deal.packageName);
    const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    await db.clientAccount.upsert({
      where: { clientOrgId: org.id },
      update: {},
      create: {
        org: deal.orgName,
        contact: deal.contactName ?? "",
        email: deal.contactEmail ?? "",
        pkg: deal.packageName ?? "Custom",
        price: deal.dealValue ?? pkg?.price ?? 0,
        ownerEmail: deal.accountOwnerEmail ?? "",
        health: "new",
        testimonial: "torequest",
        clientOrgId: org.id,
        timeline: [{ date: dateLabel, type: "note", note: "Converted from pipeline — onboarding checklist started." }],
      },
    });
  } catch (e) {
    console.error("convertDealToClient: client-account handoff failed (non-fatal)", e);
  }
```

(If `Prisma` isn't already imported as a type in `deal.ts`, add `import type { Prisma } from "@prisma/client";` — check the existing imports first; trunk `deal.ts` already imports it for `Prisma.DealUpdateInput`.)

- [ ] **Step 5: Typecheck, existing tests, commit**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib/sales/deal" ; npm test 2>&1 | tail -5
git add src/lib/sales/deal.ts
git commit -m "feat(sales): won deals land as client accounts; upgrade deals bump the existing account"
```

Expected: no type errors; the full suite stays green.

---

### Task 8: Nav — sidebar items + follow-ups badge

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Adaptation:** the branch badge block also counts `socialPost` approvals (marketing — not ported). Only the follow-ups badge comes over.

- [ ] **Step 1: Sidebar — extend the SALES sections**

In `src/components/Sidebar.tsx` (~line 116), old:

```tsx
  SALES: [
    {
      label: "Sales",
      items: [
        { href: "/sales", label: "Pipeline", icon: <IconBriefcase /> },
        { href: "/sales/calendar", label: "Calendar", icon: <IconCalendarCheck /> },
      ],
    },
    {
      // Client management moved here from HR.
      label: "Clients",
      items: [
        { href: "/hr/client-onboarding", label: "Onboarding", icon: <IconHandshake /> },
        { href: "/hr/clients", label: "Organizations", icon: <IconBuilding /> },
        { href: "/hr/requests", label: "Client Requests", icon: <IconMessageSquare /> },
        { href: "/directory", label: "Team Directory", icon: <IconUsers /> },
      ],
    },
  ],
```

new:

```tsx
  SALES: [
    {
      label: "Sales",
      items: [
        { href: "/sales", label: "Pipeline", icon: <IconBriefcase /> },
        { href: "/sales/followups", label: "Follow-ups", icon: <IconListChecks /> },
        { href: "/sales/calendar", label: "Calendar", icon: <IconCalendarCheck /> },
        { href: "/sales/templates", label: "Email Templates", icon: <IconMail /> },
      ],
    },
    {
      // Client management moved here from HR.
      label: "Clients",
      items: [
        { href: "/sales/clients", label: "Client Accounts", icon: <IconBuilding /> },
        { href: "/hr/client-onboarding", label: "Onboarding", icon: <IconHandshake /> },
        { href: "/hr/clients", label: "Organizations", icon: <IconBuilding /> },
        { href: "/hr/requests", label: "Client Requests", icon: <IconMessageSquare /> },
        { href: "/directory", label: "Team Directory", icon: <IconUsers /> },
      ],
    },
  ],
```

(`IconListChecks`, `IconMail`, `IconBuilding` are already imported in this file.)

- [ ] **Step 2: Sidebar — accept and render `navBadges`**

In the `Sidebar` props (~line 137), old:

```tsx
export function Sidebar({
  view,
  role,
  name,
  showMeetingActions = false,
```

new (and add the type below alongside the other optional props):

```tsx
export function Sidebar({
  view,
  role,
  name,
  navBadges = {},
  showMeetingActions = false,
```

with `navBadges?: Record<string, number>;` added to the prop type block. Then in the render loop (~line 179), old:

```tsx
              <NavItemLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
```

new:

```tsx
              <NavItemLink key={item.href} href={item.href} label={item.label} icon={item.icon} badge={navBadges[item.href]} />
```

(`NavItemLink` already renders a `badge` — no change there.)

- [ ] **Step 3: layout — compute the badge for the SALES view**

In `src/app/(app)/layout.tsx`, after the `meetingActionsCount` computation (~line 116), add:

```tsx
  // Sales nav badge: follow-ups due today or overdue.
  let navBadges: Record<string, number> = {};
  if (view === "SALES") {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const followupsDue = await db.salesFollowUp.count({ where: { doneAt: null, due: { lte: endOfToday } } });
    navBadges = { "/sales/followups": followupsDue };
  }
```

and pass it in the `<Sidebar` invocation (~line 168):

```tsx
        <Sidebar
          view={view}
          role={user.role}
          name={userName}
          navBadges={navBadges}
          showMeetingActions={showMeetingActions}
          meetingActionsCount={meetingActionsCount}
          showCeo={showCeo}
        />
```

(There are TWO Sidebar call sites in this layout — one ~line 146 and one ~line 168; add `navBadges={navBadges}` to both.)

- [ ] **Step 4: Build + commit**

```bash
npm run build 2>&1 | tail -5
git add src/components/Sidebar.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(sales): nav entries + follow-ups-due badge"
```

---

### Task 9: Seed the 8 email templates

**Files:**
- Create: `scripts/data/sales-console-seed.json` (copied from the branch — only the `templates` key is consumed)
- Create: `scripts/seed-sales-templates.ts`

The templates screen is empty (and useless) without content. The 8 real templates (discovery recap, proposal, payment, check-in, upgrade, re-engage, testimonial ask, referral ask) live in the branch's seed JSON. Unlike the demo deals, templates are REAL content, safe on any DB — but the seeder still touches nothing but `SalesEmailTemplate`.

- [ ] **Step 1: Copy the data file**

```bash
mkdir -p scripts/data
git show feature/sales-marketing-console:scripts/data/sales-console-seed.json > scripts/data/sales-console-seed.json
```

- [ ] **Step 2: Write the templates-only seeder**

Create `scripts/seed-sales-templates.ts`:

```ts
// Seed ONLY the 8 sales email templates (real content, not demo data).
// Idempotent: upserts by stable id t1…t8, so re-running refreshes bodies
// without duplicating. Safe on any DB — touches SalesEmailTemplate only.
//
//   npx tsx scripts/seed-sales-templates.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const seed = JSON.parse(readFileSync(join(__dirname, "data", "sales-console-seed.json"), "utf8")) as {
  templates: { id: string; cat: string; title: string; purpose?: string; body: string; sort?: number }[];
};

async function main() {
  for (const [i, t] of seed.templates.entries()) {
    const data = { cat: t.cat, title: t.title, purpose: t.purpose ?? "", body: t.body, sort: t.sort ?? i };
    await db.salesEmailTemplate.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } });
  }
  console.log(`Seeded ${seed.templates.length} email templates.`);
}

main().finally(() => db.$disconnect());
```

- [ ] **Step 3: Run it against the local DB and eyeball the screen**

```bash
npx tsx scripts/seed-sales-templates.ts
```

Expected: `Seeded 8 email templates.` Re-run once more — still 8, no duplicates.

- [ ] **Step 4: Commit**

```bash
git add scripts/data/sales-console-seed.json scripts/seed-sales-templates.ts
git commit -m "feat(sales): seed the 8 sales email templates"
```

---

### Task 10: End-to-end verification (local)

No new files — drive the real app (use the `run-va-management-next` project skill to start it).

- [ ] **Step 1: Full suite + build**

```bash
npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -5
```

Expected: all tests pass, build clean.

- [ ] **Step 2: Start the app and walk the flows as an admin**

1. `/sales/templates` — 8 template cards; edit a body, Save, reload → edit persisted; Copy puts the body on the clipboard.
2. `/sales/followups` — "Add" a follow-up due today → appears in the Today bucket; nav badge on Follow-ups shows 1 after reload; Snooze → moves out (+7 days), badge drops; Done → row disappears.
3. `/sales/clients` — empty until a deal converts (expected on a fresh DB). Convert a signed+paid test deal on `/sales` → account appears with the "Converted from pipeline" timeline entry; open the drawer: log a call (timeline grows, Last touch updates), Schedule check-in → a check-in follow-up due in 3 days shows on `/sales/followups`, Start upgrade → lands on `/sales?deal=<new id>` with the drawer OPEN (deep-link proof) at stage "Proposal needed", and a "Send upgrade proposal" follow-up exists.
4. Guard: while impersonating a plain VA (or hitting the pages logged out of admin), `/sales/followups` bounces to `/`.

- [ ] **Step 3: Commit anything the walk shook out, or record clean**

```bash
git status --short
```

Expected: clean tree.

---

### Task 11: Integrate + deploy to dev-team

- [ ] **Step 1: Merge into the integration branch**

```bash
git checkout integration/ceo-on-dev
git merge --no-ff feature/sales-suite -m "merge: sales suite (follow-ups, client accounts, templates)"
git push origin integration/ceo-on-dev feature/sales-suite
```

- [ ] **Step 2: Check what the dev box is running BEFORE deploying** (house rule — never clobber unmerged work):

```bash
ssh root@74.208.40.108 "cd /app/SecondBrain/va-management/current && git log -1 --oneline && git rev-parse --abbrev-ref HEAD" 2>/dev/null || ssh root@74.208.40.108 "ls /app/SecondBrain/ | grep va-management"
```

If the box runs a branch with commits not in `integration/ceo-on-dev`, STOP and reconcile first.

- [ ] **Step 3: Deploy dev** (guarded script; dev requires an explicit ref):

```bash
./deploy.sh dev integration/ceo-on-dev
```

The script runs `prisma migrate deploy` (applies `_sales_suite`) as part of the pipeline. Then seed templates on the box:

```bash
ssh root@74.208.40.108 "cd /app/SecondBrain/va-management/current && set -a && . ../shared/.env && set +a && npx tsx scripts/seed-sales-templates.ts"
```

- [ ] **Step 4: Verify a REAL page, not just /api/health** (house rule): load `https://dev-team.pwasecondbrain.uk/sales/followups` and `/sales/templates` logged in; check `journalctl -u va-management-web -n 30 --no-pager` for errors.

- [ ] **Step 5: Wrap up** — this is dev-only. Prod promotion (merge to `main` + `./deploy.sh prod`) is a separate, later decision.

---

## Self-Review Notes

- **TESTER regression risk** — covered: guard + API both route through `salesAccessFor`, tested in `tests/sales-guard.test.ts`.
- **Marketing bleed-through** — checked: components grep (Task 5 Step 1), deal.ts port drops `marketingTestimonial.create`, layout badge drops `socialPost`, schema adds no marketing models.
- **Migration ordering** — fresh timestamp via `prisma migrate diff`, not the branch's 2026-07-07 migration (which both bundles marketing tables and predates 9 applied trunk migrations).
- **Type consistency** — `salesAccessFor` is used by both `requireSalesUser` (Task 3) and the API `allowUser` (Task 4); `openDealId` prop name matches between `SalesBoard` (Task 6 Step 1) and the page (Task 6 Step 2); `FollowUpRow`/`ClientAccountRow`/`EmailTemplateRow` come from the one ported reads module.
- **`upgradeDealId` dangling after manual deal deletion** — pre-existing branch behavior (`account_start_upgrade` re-checks existence and re-creates); accepted as-is.
